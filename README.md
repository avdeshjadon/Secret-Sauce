<div align="center">

# Secret Sauce
### Your Real-Time AI Strategic Companion

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-41.3.0-47848F.svg?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-blue.svg?logo=google-gemini&logoColor=white)](https://aistudio.google.com/)

**Secret Sauce** is a high-performance, discreet AI assistant designed to provide real-time contextual intelligence during video calls, interviews, presentations, and high-stakes meetings. By analyzing your screen and audio live, it delivers precise, ready-to-speak responses directly on your display.

</div>

## Key Features

### Multimodal Intelligence
- **Live Screen & Audio Analysis**: Powered by **Google Gemini 2.0 Flash Live**, Secret Sauce "sees" your screen and "hears" the conversation to provide instant context.
- **Speaker Diarization**: Intelligently distinguishes between the **Interviewer** and the **Candidate** for highly relevant responses.
- **Real-Time Web Search**: Integrated Google Search tool ensures your answers are always backed by the latest industry data and news.

### Specialized Strategic Profiles
Tailor your experience with optimized prompts for every scenario:
- **Interview**: Discreet teleprompter mode to help you "crack" the job.
- **Sales Call**: Persuasive, value-driven talk tracks to close deals.
- **Business Meeting**: Clear, action-oriented responses for professional discussions.
- **Presentation**: Confident coaching with data-backed talking points.
- **Negotiation**: Strategic win-win positioning and objection handling.
- **Exam**: Efficient, accurate answers for high-pressure testing.

### Stealth & UX
- **Transparent Overlay**: An always-on-top window that stays out of your way.
- **Click-Through Mode**: Instantly make the window transparent to mouse events (`Cmd/Ctrl + M`).
- **Custom Keybinds**: Fully remappable shortcuts for window movement and actions.
- **Markdown Support**: Richly formatted AI responses with syntax highlighting for code.

### Multi-Provider Support
- **BYOK (Bring Your Own Key)**: Use your own Google Gemini, Groq, or OpenAI keys.
- **Local AI**: Support for local LLMs via **Ollama** and transcription via **Whisper**.
- **Hybrid Orchestration**: Seamlessly switch between providers (Groq > Gemini > Gemma) for optimal speed and reliability.

---

## Getting Started

### Prerequisites
- macOS (Latest recommended), Windows, or Linux
- [Google Gemini API Key](https://aistudio.google.com/apikey)
- Node.js & npm

> ### ⚠️ Important Note for macOS Users
>
> Because Secret Sauce is a free, open-source application, it is not signed with a paid Apple Developer certificate. When you download the compiled `.dmg` and drag the app into your Applications folder, macOS Gatekeeper may flag the app as "damaged" and offer to move it to the Trash.
>
> This is just Apple's standard quarantine flag for unsigned apps. To bypass this and run the app normally, open your Terminal and run the following command to remove the quarantine attribute:
>
> ```bash
> sudo xattr -cr /Applications/"Secret Sauce.app"
> ```
>
> You may be prompted to enter your Mac password. Once the command completes, you can open Secret Sauce from your Applications folder without any issues!

### Installation
1. **Clone the repository**:
   ```bash
   git clone https://github.com/avdeshjadon/secret-sauce.git
   cd secret-sauce
   ```