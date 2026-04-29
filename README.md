<div align="center">

#Secret Sauce

### Your Real-Time AI Strategic Companion

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Electron](https://img.shields.io/badge/Electron-41.3.0-47848F.svg?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Gemini](https://img.shields.io/badge/AI-Gemini%202.0%20Flash-blue.svg?logo=google-gemini&logoColor=white)](https://aistudio.google.com/)

**Secret Sauce** is a high-performance, discreet AI assistant designed to provide real-time contextual intelligence during video calls, interviews, presentations, and high-stakes meetings. By analyzing your screen and audio live, it delivers precise, ready-to-speak responses directly on your display.

</div>

---

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

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/avdeshjadon/secret-sauce.git
    cd secret-sauce
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Launch the application**:
    ```bash
    npm start
    ```

---

## Keyboard Shortcuts

| Action                   | Shortcut                |
| :----------------------- | :---------------------- |
| **Move Window**          | `Ctrl/Cmd + Arrow Keys` |
| **Toggle Click-through** | `Ctrl/Cmd + M`          |
| **Back / Close**         | `Ctrl/Cmd + \`          |
| **Send Message**         | `Enter`                 |
| **Manual Screenshot**    | `Ctrl/Cmd + Enter`      |

---

## Privacy by Design

- **Local Processing**: Audio resampling and local LLM options keep your data on your machine.
- **Context Isolation**: Secure IPC handling ensures your credentials stay protected.
- **User Control**: Clear transparency on what data is captured and how it's used.

---

## Roadmap & Future Work

- [ ] **Local Transcription**: Full integration of `whisper.cpp` for offline performance.
- [ ] **Dual Audio Capture**: Simultaneous microphone and system audio on all platforms.
- [ ] **UI Modernization**: Complete migration to **Shadcn/UI** and **React**.
- [ ] **TypeScript Migration**: Strict type safety for the entire codebase.

---

<div align="center">
Made with ❤️ by [avdeshjadon](https://github.com/avdeshjadon)
</div>
