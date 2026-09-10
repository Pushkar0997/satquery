from langgraph.graph import StateGraph, START, END
from agent.state import SatQueryState
from agent.nodes import interpret_query, validate_input, route_model, execute_model, synthesize

def build_graph():
    graph = StateGraph(SatQueryState)
    graph.add_node("interpret_query", interpret_query)
    graph.add_node("validate_input", validate_input)
    graph.add_node("route_model", route_model)
    graph.add_node("execute_model", execute_model)
    graph.add_node("synthesize", synthesize)

    graph.add_edge(START, "interpret_query")
    graph.add_edge("interpret_query", "validate_input")
    graph.add_edge("validate_input", "route_model")
    graph.add_edge("route_model", "execute_model")
    graph.add_edge("execute_model", "synthesize")
    graph.add_edge("synthesize", END)
    return graph.compile()

def run_agent(query, image_paths):
    state = {
        "query": query,
        "image_paths": image_paths,
        "trace": []
    }
    result = build_graph().invoke(state)
    return result
