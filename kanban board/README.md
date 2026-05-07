# Real-Time Collaborative Kanban Board

A full-stack collaborative Kanban board built with React, Tailwind CSS, Express, MongoDB, JWT authentication, and Socket.IO real-time updates.

Users can register, log in, create boards, invite members, create lists, add/edit/delete tasks, assign members, set due dates, and drag tasks between columns.

## Tech Stack

- React 19 + Vite
- Tailwind CSS
- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Socket.IO real-time updates

## Project Structure

```text
kanban board/
  Client/          React + Tailwind frontend
  server/          Express + MongoDB backend
```

## Environment

Create or update `server/.env`:

```env
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/kanban_board
JWT_SECRET=mysecret
```

MongoDB must be running before you start the backend.

## Run In Development

Use two terminals.

Terminal 1: backend API

```powershell
cd "c:\Users\manas\OneDrive\Documents\programming\To_Do_List\kanban board\server"
npm install
npm run dev
```

Backend runs on:

```text
http://127.0.0.1:5001
```

Terminal 2: React frontend

```powershell
cd "c:\Users\manas\OneDrive\Documents\programming\To_Do_List\kanban board\Client"
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:5173
```

Vite proxies `/auth`, `/boards`, `/lists`, `/tasks`, and `/socket.io` to the backend at `http://127.0.0.1:5001`.

## Production Build

Build the React frontend:

```powershell
cd "c:\Users\manas\OneDrive\Documents\programming\To_Do_List\kanban board\Client"
npm run build
```

Then run the backend:

```powershell
cd "c:\Users\manas\OneDrive\Documents\programming\To_Do_List\kanban board\server"
npm run start
```

Open:

```text
http://localhost:5001
```

The backend serves the built React files from `Client/dist`.

## API Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /boards`
- `POST /boards`
- `GET /boards/:id`
- `POST /boards/:id/invite`
- `POST /lists`
- `PATCH /lists/:id`
- `POST /tasks`
- `PATCH /tasks/:id`
- `DELETE /tasks/:id`

## Troubleshooting

If Vite shows:

```text
http proxy error: connect ECONNREFUSED 127.0.0.1:5001
```

start the backend:

```powershell
cd "c:\Users\manas\OneDrive\Documents\programming\To_Do_List\kanban board\server"
npm run dev
```

If PowerShell blocks `npm`, use `npm.cmd` as shown above.
