# Pixel English Quest API — Backend

The standalone, dependency-free Node.js API for Pixel English Quest. It uses Node's built-in HTTP and filesystem modules and persists demo progress to JSON.

## Development

```bash
npm install
npm run dev
```

The API runs at `http://localhost:3001` by default.

## Commands

```bash
npm run check
npm start
```

## Configuration

- `PORT` changes the server port.
- `AFK_DATA_FILE` selects a different JSON persistence file.

## Routes

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/lessons/:id`
- `POST /api/lessons/:id/complete`
- `GET /api/quick-quiz`
- `POST /api/quick-quiz/submit`
- `PUT /api/profile`
- `POST /api/reset`
