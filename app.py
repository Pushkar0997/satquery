import json
import os

import streamlit as st
from dotenv import load_dotenv
from streamlit_mic_recorder import mic_recorder

from agent.graph import run_agent
from tools.speech_to_text import SpeechToTextError, transcribe_audio


load_dotenv()
os.makedirs("data/uploads", exist_ok=True)
os.makedirs("data/outputs", exist_ok=True)

if "query_text" not in st.session_state:
    st.session_state.query_text = ""


st.set_page_config(page_title="SatQuery AI", page_icon="🛰️", layout="wide")

st.title("🛰️ SatQuery AI")
st.caption(
    "Agentic Vision-Language Assistant for Multimodal Remote Sensing Image Analysis"
)

with st.sidebar:
    st.header("Input")

    uploaded = st.file_uploader(
        "Upload 1 or 2 satellite images",
        type=["png", "jpg", "jpeg", "tif", "tiff"],
        accept_multiple_files=True,
    )

    st.divider()
    st.subheader("Voice query")

    language_options = {
        "Auto-detect": None,
        "Hindi": "hi",
        "English": "en",
        "Marathi": "mr",
        "Tamil": "ta",
        "Telugu": "te",
        "Kannada": "kn",
        "Bengali": "bn",
    }

    selected_language = st.selectbox(
        "Spoken language",
        options=list(language_options.keys()),
    )
    spoken_language = language_options[selected_language]

    voice_recording = mic_recorder(
        start_prompt="Start voice query",
        stop_prompt="Stop and transcribe",
        just_once=True,
        use_container_width=True,
        format="wav",
        key="satquery_voice_recorder",
    )
    st.caption(
        "Record a short question. The recognised text will appear in the query box. "
        "Voice recognition runs locally; the first use downloads its model once."
    )

    if voice_recording and voice_recording.get("bytes"):
        recording_id = str(hash(voice_recording["bytes"]))
        if recording_id != st.session_state.get("last_voice_recording_id"):
            st.session_state.last_voice_recording_id = recording_id
            with st.spinner("Transcribing your voice query..."):
                try:
                    transcript = transcribe_audio(
                        voice_recording["bytes"], language=spoken_language
                    )
                except SpeechToTextError as error:
                    st.error(str(error))
                else:
                    if transcript:
                        st.session_state.query_text = transcript
                        st.session_state.voice_transcript = transcript
                        st.rerun()
                    else:
                        st.warning(
                            "No speech was detected. Please record again or type your question."
                        )

    if st.session_state.get("voice_transcript"):
        st.success(f"Recognised query: {st.session_state.voice_transcript}")

    st.markdown(
        """
        **Recommended tests**
        - Describe the land cover
        - Is there visible flooding?
        - What changed between these dates?
        - Where are the water bodies?
        - Compare optical and SAR observations
        """
    )

    st.divider()
    st.info(
        "SatQuery AI reports visible or detected evidence. "
        "It does not predict a future disaster with certainty."
    )

query = st.text_area(
    "Ask SatQuery AI",
    placeholder=(
        "Type a question, or use Start voice query in the sidebar. "
        "Example: Is there any visible flood damage?"
    ),
    height=110,
    key="query_text",
)

if st.button("Analyze", type="primary", use_container_width=False):
    if not uploaded:
        st.error("Please upload at least one satellite image.")
        st.stop()

    if len(uploaded) > 2:
        st.error("Please upload only 1 or 2 images.")
        st.stop()

    paths = []
    for item in uploaded:
        safe_name = os.path.basename(item.name).replace(" ", "_")
        path = os.path.join("data/uploads", safe_name)

        with open(path, "wb") as file:
            file.write(item.getbuffer())

        paths.append(path)

    effective_query = query.strip()

    if not effective_query:
        effective_query = (
            "Describe this satellite image and explain any visible "
            "disaster-related risk in simple language."
        )

    with st.spinner("SatQuery AI is analyzing the satellite image..."):
        try:
            result = run_agent(effective_query, paths)
        except Exception as error:
            st.exception(error)
            st.stop()

    st.success("Analysis completed")

    left, right = st.columns([2, 1])

    with left:
        st.subheader("Simple Explanation")
        st.write(result["final_answer"])

        if result.get("warning"):
            st.warning(result["warning"])

        st.subheader("Evidence")
        for evidence in result.get("evidence", []):
            st.write(evidence)

        if result.get("output_image") and os.path.exists(result["output_image"]):
            st.subheader("Detected Change / Region")
            st.image(result["output_image"], use_container_width=True)

    with right:
        st.subheader("Execution Summary")
        st.write(f"**Task:** {result.get('task', 'unknown')}")
        st.write(f"**Model:** {result.get('model', 'unknown')}")
        st.write(f"**Confidence:** {result.get('confidence', 'not calibrated')}")

        st.subheader("Trace")
        for trace_item in result.get("trace", []):
            st.write(f"✓ {trace_item}")

        st.subheader("Input tiles")
        for image_path in paths:
            st.caption(os.path.basename(image_path))
            st.image(image_path, use_container_width=True)

    report = {
        "query": effective_query,
        "voice_transcript": st.session_state.get("voice_transcript"),
        "task": result.get("task"),
        "model": result.get("model"),
        "answer": result.get("final_answer"),
        "evidence": result.get("evidence"),
        "confidence": result.get("confidence"),
        "trace": result.get("trace"),
    }

    st.download_button(
        "Download analysis report",
        data=json.dumps(report, indent=2, ensure_ascii=False),
        file_name="satquery_analysis.json",
        mime="application/json",
    )
