# WhisperGrid 🎙️📺

**Speak the vibe. Find the video.**

WhisperGrid is a cutting-edge multimodal retrieval application that allows users to search through a video library using nothing but sound. Powered by the **Gemini Embedding 2** model, it translates audio inputs (speech, humming, or ambient sounds) into semantic vectors and matches them against a pre-embedded video library in real-time.

Video Demonstration: [https://youtu.be/jqNQZZuvfuI](https://youtu.be/jqNQZZuvfuI)

### Screenshots



## Features

- **Semantic Audio Search**: Search by describing a scene, humming a tune, or making a sound.
- **Real-time Matching**: Instantaneous cosine similarity calculation between audio and video embeddings.
- **Quantitative Feedback**: Displays the exact cosine similarity percentage for the winning match, showing how closely the audio aligns with the video.
- **Audio Visualizer**: Real-time waveform feedback during recording using the Web Audio API for a more interactive experience.
- **Granular Loading**: Individual video tiles show their own loading states (Embedding, Matching, or Pending), providing clear progress feedback without blocking the UI.
- **Smart Caching**: Embeddings are cached in `localStorage` after the first generation, reducing subsequent load times from minutes to milliseconds.
- **Multimodal Intelligence**: Leverages Gemini's ability to understand the relationship between sound and vision.
- **Sleek UI**: A dark, cinematic 3x3 grid designed for focus and immersion.
- **Local-First**: Designed to run with local video assets for maximum privacy and performance.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Audio Processing**: Web Audio API (AnalyserNode)
- **AI Engine**: `@google/genai` (Gemini Embedding 2)
- **Backend**: Express (for asset serving and SPA hosting)

## Architecture

WhisperGrid follows a "Semantic Vector Search" architecture:

1.  **Initialization**: On boot, the app fetches local videos. If not cached, it generates semantic embeddings using `gemini-embedding-2-preview`.
2.  **Real-time Feedback**: While recording, a Canvas-based visualizer provides live feedback of the audio input.
3.  **Audio Capture**: The user records a short audio snippet via the browser's MediaRecorder API.
4.  **Audio Embedding**: The audio blob is sent to Gemini to generate a corresponding semantic vector.
5.  **Vector Matching**: The app calculates the **Cosine Similarity** between the audio vector and all stored video vectors.
6.  **Visual Feedback**: The video with the highest similarity score is highlighted, displaying its "Match Percentage."

```typescript
// Core matching logic
const cosineSimilarity = (a: number[], b: number[]) => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
};
```

## Setup & Installation

### Prerequisites
- Node.js 18+
- A Google AI Studio API Key

### Steps
1.  **Clone the repo**:
    ```bash
    git clone https://github.com/harishkotra/whispergrid.git
    cd whispergrid
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment**:
    Create a `.env` file and add your API key:
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```
4.  **Add your Videos**:
    Place 9 `.mp4` files in `public/videos/` named `1.mp4` through `9.mp4`.
5.  **Run Development Server**:
    ```bash
    npm run dev
    ```

## Contributing

We welcome contributions! Here are some ideas for features you could add:
- **Dynamic Library**: Allow users to upload their own videos to the grid.
- **Multi-Match**: Highlight the top 3 matches with varying intensities.
- **Persistent Storage**: Use Firestore to cache embeddings so they don't need to be regenerated on every reload.
- **Mobile App**: Port the UI to React Native for a mobile-first search experience.

## 📜 Credits
- Videos sourced from [Pexels](https://www.pexels.com).
- Powered by [Gemini Embeddings 2](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/).
