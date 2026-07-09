import streamlit as st
import requests
import json

# Set up page configurations
st.set_page_config(
    page_title="Local LLM Chat (Ollama)",
    page_icon="🤖",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Premium Styling (Dark Mode Accent)
st.markdown("""
<style>
    /* Main Layout Styling */
    .stApp {
        background: linear-gradient(135deg, #0f0f13 0%, #15151e 100%);
        color: #e2e8f0;
    }
    
    /* Sidebar Styling */
    section[data-testid="stSidebar"] {
        background-color: #0b0b0f !important;
        border-right: 1px solid #27273a;
    }
    
    /* Input Box Customization */
    div[data-testid="stChatInput"] textarea {
        background-color: #1a1a24 !important;
        color: #ffffff !important;
        border: 1px solid #3b3b4f !important;
        border-radius: 8px !important;
    }

    /* Headings */
    h1, h2, h3 {
        font-family: 'Inter', sans-serif;
        font-weight: 700;
        background: linear-gradient(90deg, #6366f1 0%, #a855f7 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    
    /* Code blocks border */
    .stCodeBlock {
        border: 1px solid #27273a !important;
        border-radius: 8px !important;
    }
</style>
""", unsafe_allow_html=True)

OLLAMA_URL = "http://localhost:11434"

# Title
st.title("🤖 Local LLM Workspace")
st.caption("Direct connection to your local Ollama instance (0% Gemini quota usage)")

# Retrieve list of local models
@st.cache_data(ttl=10)
def get_local_models():
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        if response.status_code == 200:
            data = response.json()
            return [model['name'] for model in data.get('models', [])]
    except Exception:
        pass
    return []

local_models = get_local_models()

# Sidebar controls
with st.sidebar:
    st.header("⚙️ Configuration")
    
    if not local_models:
        st.error("⚠️ Could not connect to Ollama. Make sure it's running locally.")
        if st.button("🔄 Retry Connection"):
            st.rerun()
        selected_model = None
    else:
        selected_model = st.selectbox(
            "Select Local Model",
            options=local_models,
            index=local_models.index("qwen2.5-coder:14b") if "qwen2.5-coder:14b" in local_models else 0
        )
        
    st.divider()
    
    # Generation parameters
    st.subheader("🎛️ Parameters")
    temperature = st.slider("Temperature", min_value=0.0, max_value=1.5, value=0.2, step=0.1, help="Lower values make the output more deterministic; higher values make it more creative.")
    system_prompt = st.text_area(
        "System Instruction",
        value="You are an expert software engineer and assistant. Provide high-quality, clean, and well-commented code.",
        height=150
    )
    
    if st.button("🧹 Clear Chat History"):
        st.session_state.chat_history = []
        st.rerun()

# Maintain Chat State
if "chat_history" not in st.session_state:
    st.session_state.chat_history = []

# Display conversation
for msg in st.session_state.chat_history:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# User Chat Input
if prompt := st.chat_input("Ask Qwen to write code, design algorithms, or solve problems..."):
    if not selected_model:
        st.error("Please start or connect to Ollama to send messages.")
    else:
        # Show user message
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # Call Ollama API streamingly or in bulk
        with st.chat_message("assistant"):
            response_placeholder = st.empty()
            full_response = ""
            
            # Format payload for Ollama
            messages = [{"role": "system", "content": system_prompt}]
            for h in st.session_state.chat_history:
                messages.append({"role": h["role"], "content": h["content"]})
                
            payload = {
                "model": selected_model,
                "messages": messages,
                "options": {
                    "temperature": temperature
                },
                "stream": True
            }
            
            try:
                # Request streaming output from Ollama
                res = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, stream=True, timeout=30)
                if res.status_code == 200:
                    for line in res.iter_lines():
                        if line:
                            chunk = json.loads(line.decode('utf-8'))
                            content = chunk.get("message", {}).get("content", "")
                            full_response += content
                            response_placeholder.markdown(full_response + "▌")
                    response_placeholder.markdown(full_response)
                    st.session_state.chat_history.append({"role": "assistant", "content": full_response})
                else:
                    st.error(f"Error calling Ollama API: {res.status_code}")
            except Exception as e:
                st.error(f"Connection failed: {e}")
