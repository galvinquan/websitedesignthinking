# WEBDUBAO — Smart Route + Weather + GenAI Assistant

This project is a small web app that provides route planning (OpenRouteService), weather (Open-Meteo), air quality (WAQI), and a GenAI chatbot powered by OpenAI.

Key points:
- The OpenAI API key should NOT be stored in the frontend. A minimal Node/Express server (server.js) is included to proxy chat requests securely.
- Add your API keys in `config.js` for ORS/WAQI and in `.env` for OpenAI.

Getting started:

1. Copy `.env.example` to `.env` and add your OpenAI key.

   ```powershell
   cp .env.example .env
   # edit .env and replace OPENAI_API_KEY
   ```

2. (Optional) Edit `config.js` with your ORS and WAQI keys.

3. Install dependencies and start the server:

   ```powershell
   npm install
   npm start
   ```

4. Visit `http://localhost:3000` in your browser.

Notes:
- If you get CORS errors, ensure you request the site via the server (http://localhost:3000) not `file://`.
- ORS/WAQI keys can be kept in `config.js` for convenience, but they may expose your quotas. Consider using server-side proxy if you want to hide those keys.
