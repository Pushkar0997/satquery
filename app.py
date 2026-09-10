import os
import json
import streamlit as st
from dotenv import load_dotenv
from agent.graph import run_agent

load_dotenv()
os.makedirs("data/uploads", exist_ok=True)
os.makedirs("data/outputs", exist_ok=True)

st.set_page_config(page_title="SatQuery AI", page_icon="🛰️", layout="wide")

st.title("🛰️ SatQuery AI")
st.caption("Agentic Vision-Language Assistant for Multimodal Remote Sensing Image Analysis")

with st.sidebar:
    st.header("Input")
    uploaded = st.file_uploader(
        "Upload 1 or 2 satellite images",
        type=["png", "jpg", "jpeg", "tif", "tiff"],
        accept_multiple_files=True
    )

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
        "Important: SatQuery AI reports visible or detected evidence. "
        "It does not predict a future disaster with certainty."
    )

query = st.text_area(
    "Ask SatQuery AI",
    placeholder="Example: Is there any visible flood damage? Explain it in simple language.",
    height=110
)

if st.button("Analyze", type="primary", use_container_width=False):
    if not uploaded:
        st.error("Please upload at least one image.")
        st.stop()

    if len(uploaded) > 2:
        st.error("Please upload only 1 or 2 images.")
        st.stop()

    paths = []
    for item in uploaded:
        safe_name = os.path.basename(item.name).replace(" ", "_")
        path = os.path.join("data/uploads", safe_name)
        with open(path, "wb") as f:
            f.write(item.getbuffer())
        paths.append(path)

    if not query.strip():
        query = "Describe this satellite image and explain any visible disaster-related risk in simple language."

    with st.spinner("SatQuery AI is analyzing the satellite image..."):
        try:
            result = run_agent(query, paths)
        except Exception as e:
            st.exception(e)
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
        for item in result.get("trace", []):
            st.write(f"✓ {item}")

        st.subheader("Input")
        for p in paths:
            st.caption(os.path.basename(p))
            st.image(p, use_container_width=True)

    report = {
        "query": query,
        "task": result.get("task"),
        "model": result.get("model"),
        "answer": result.get("final_answer"),
        "evidence": result.get("evidence"),
        "confidence": result.get("confidence"),
        "trace": result.get("trace")
    }

    st.download_button(
        "Download analysis report",
        data=json.dumps(report, indent=2),
        file_name="satquery_analysis.json",
        mime="application/json"
    )
