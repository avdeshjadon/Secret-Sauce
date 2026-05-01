# Local AI Implementation Guide: Ollama

This document provides a professional, step-by-step guide for setting up Ollama and local Large Language Models (LLMs) on macOS, Windows, and Linux systems.

---

## 1. macOS Setup Guide

### Step 1: Installation
#### Option A: Terminal (Recommended)
Use Homebrew to install and manage Ollama:
```bash
brew install ollama
```
#### Option B: Manual Installation
1. Visit the official download page: https://ollama.com/download/mac
2. Download the `Ollama-darwin.zip` file.
3. Extract the file and move the `Ollama` application to your `/Applications` folder.

### Step 2: Start the Service
If installed via Homebrew:
```bash
brew services start ollama
```
If installed manually, launch the Ollama application from your Applications folder.

### Step 3: Verification
Open your Terminal and run:
```bash
ollama --version
```

---

## 2. Windows Setup Guide

### Step 1: Installation
#### Option A: Terminal (Recommended)
Open PowerShell as Administrator and use Winget:
```powershell
winget install ollama.ollama
```
#### Option B: Manual Installation
1. Download the installer from: https://ollama.com/download/windows
2. Run `OllamaSetup.exe` and follow the on-screen instructions.

### Step 2: Start the Service
Ollama usually starts automatically after installation. You can find the icon in your system tray. If it is not running, search for "Ollama" in the Start menu and launch it.

### Step 3: Verification
Open PowerShell or Command Prompt and run:
```powershell
ollama --version
```

---

## 3. Linux Setup Guide

### Step 1: Installation (Terminal Only)
Run the official installation script:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 2: Manage Service
The script installs Ollama as a systemd service. You can manage it with:
```bash
sudo systemctl start ollama
sudo systemctl enable ollama
```

### Step 3: Verification
```bash
ollama --version
```

---

## 4. Model Management

### Downloading Models via Terminal
To download a model, use the `pull` command. For this app, a **Vision Model** is required to support screenshots.

**Recommended for Screenshots:**
```bash
ollama pull gemma3:4b
```

**Recommended for Text-only:**
```bash
ollama pull llama3.1
```

### Downloading Models Manually (Search)
1. Go to the Ollama Library: https://ollama.com/library
2. Search for a model (e.g., "llava" or "llama3.1").
3. Copy the pull command provided on the model page and run it in your terminal.

### Running a Model
To start a chat session with a downloaded model:
```bash
ollama run llava
```

### Verifying Downloaded Models
To see a list of all models saved on your system:
```bash
ollama list
```

---

## 5. Hardware and Compatibility

### Memory (RAM) Requirements
The following table outlines the minimum RAM required based on the model parameter size:

| Model Size | Minimum RAM | Recommended RAM |
| :--- | :--- | :--- |
| 3B - 4B (e.g., Phi-3) | 4 GB | 8 GB |
| 7B - 8B (e.g., Llama 3.1, Llava) | 8 GB | 16 GB |
| 13B - 14B | 16 GB | 32 GB |
| 30B+ | 32 GB | 64 GB |

### Performance Note
If your system has a dedicated GPU (NVIDIA, AMD, or Apple Silicon), Ollama will automatically utilize it for faster inference. If a model exceeds your available VRAM, it will utilize system RAM (CPU mode), which significantly reduces speed.

---

## 6. Troubleshooting

### Resetting the Service
If the API is unresponsive, restart the service:
- **macOS (Homebrew)**: `brew services restart ollama`
- **Linux**: `sudo systemctl restart ollama`
- **Windows**: Right-click the Ollama icon in the system tray, select "Quit", and relaunch the app.

### Stopping Active Models
To stop all running models and free up memory:
- **macOS/Linux**: `pkill ollama`
- **Windows**: `taskkill /IM ollama.exe /F`

---

## 7. Integration with Secret Sauce

To use your local Ollama setup within the Secret Sauce application, follow these configuration steps:

### Step 1: Set the Ollama Host
In the application settings, locate the "Ollama Host" or "API Endpoint" field and enter the following address:
```text
http://127.0.0.1:11434
```

### Step 2: Select a Vision Model
Since Secret Sauce uses screenshots, you **must** use a vision-capable model for the best experience:
1. Run `ollama pull gemma3:4b` in your terminal.
2. In the application's model selection, select `gemma3:4b`.
3. If you use a text-only model like `llama3.1`, the AI will not be able to "see" your screen.

### Step 3: Test the Connection
Ensure Ollama is running in the background before starting a session in Secret Sauce.
