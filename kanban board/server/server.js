const express = require("express");
const http = require("http");
const path = require("path");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");

const auth = require("./middleware/auth");
const Board = require("./models/Board");
const List = require("./models/List");
const Task = require("./models/Task");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});
const PORT = process.env.PORT || 5000;
const clientDistPath = path.join(__dirname, "../Client/dist");

app.use(cors());
app.use(express.json());
app.use(express.static(clientDistPath));

function signToken(user) {
  return jwt.sign(
    { id: user._id.toString(), name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function userSummary(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

async function requireBoardMember(boardId, userId) {
  const board = await Board.findOne({
    _id: boardId,
    "members.user": userId,
  });

  if (!board) {
    const error = new Error("Board not found");
    error.status = 404;
    throw error;
  }

  return board;
}

async function loadBoard(boardId, userId) {
  const board = await requireBoardMember(boardId, userId);
  await board.populate("members.user", "name email");

  const lists = await List.find({ board: boardId }).sort({ position: 1, createdAt: 1 });
  const tasks = await Task.find({ board: boardId })
    .populate("assignedTo", "name email")
    .sort({ position: 1, createdAt: 1 });

  return {
    board: {
      id: board._id.toString(),
      name: board.name,
      owner: board.owner.toString(),
      createdAt: board.createdAt,
      members: board.members.map((member) => ({
        id: member.user._id.toString(),
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      })),
    },
    lists: lists.map((list) => ({
      id: list._id.toString(),
      board: list.board.toString(),
      title: list.title,
      position: list.position,
    })),
    tasks: tasks.map((task) => ({
      id: task._id.toString(),
      board: task.board.toString(),
      list: task.list.toString(),
      title: task.title,
      description: task.description,
      assignedTo: task.assignedTo ? userSummary(task.assignedTo) : null,
      dueDate: task.dueDate,
      position: task.position,
      createdAt: task.createdAt,
    })),
  };
}

function emitBoard(boardId, event, payload) {
  io.to(`board:${boardId}`).emit(event, payload);
}

async function nextListPosition(boardId) {
  const latest = await List.findOne({ board: boardId }).sort({ position: -1 });
  return latest ? latest.position + 1 : 0;
}

async function nextTaskPosition(listId) {
  const latest = await Task.findOne({ list: listId }).sort({ position: -1 });
  return latest ? latest.position + 1 : 0;
}

app.post("/auth/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const user = await User.create({ name, email, password });
    return res.status(201).json({ token: signToken(user), user: userSummary(user) });
  } catch (error) {
    return next(error);
  }
});

app.post("/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    return res.json({ token: signToken(user), user: userSummary(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/auth/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({ user: userSummary(user) });
  } catch (error) {
    return next(error);
  }
});

app.get("/boards", auth, async (req, res, next) => {
  try {
    const boards = await Board.find({ "members.user": req.user.id }).sort({ updatedAt: -1 });
    return res.json({
      boards: boards.map((board) => ({
        id: board._id.toString(),
        name: board.name,
        owner: board.owner.toString(),
        createdAt: board.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/boards", auth, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Board name is required" });

    const createdBoard = await Board.create({
      name,
      owner: req.user.id,
      members: [{ user: req.user.id, role: "admin" }],
    });

    await List.create([
      { board: createdBoard._id, title: "To Do", position: 0 },
      { board: createdBoard._id, title: "In Progress", position: 1 },
      { board: createdBoard._id, title: "Done", position: 2 },
    ]);

    return res.status(201).json(await loadBoard(createdBoard._id, req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.get("/boards/:id", auth, async (req, res, next) => {
  try {
    return res.json(await loadBoard(req.params.id, req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.post("/boards/:id/invite", auth, async (req, res, next) => {
  try {
    const { email, role = "member" } = req.body;
    const board = await requireBoardMember(req.params.id, req.user.id);
    const requester = board.members.find((member) => member.user.toString() === req.user.id);

    if (requester.role !== "admin") {
      return res.status(403).json({ message: "Only board admins can invite members" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No user found for that email" });

    const alreadyMember = board.members.some((member) => member.user.toString() === user._id.toString());
    if (!alreadyMember) {
      board.members.push({ user: user._id, role: role === "admin" ? "admin" : "member" });
      await board.save();
    }

    const state = await loadBoard(req.params.id, req.user.id);
    emitBoard(req.params.id, "board:updated", state);
    return res.json(state);
  } catch (error) {
    return next(error);
  }
});

app.post("/lists", auth, async (req, res, next) => {
  try {
    const { boardId, title } = req.body;
    if (!boardId || !title) return res.status(400).json({ message: "Board and title are required" });

    await requireBoardMember(boardId, req.user.id);
    const list = await List.create({
      board: boardId,
      title,
      position: await nextListPosition(boardId),
    });

    const state = await loadBoard(boardId, req.user.id);
    emitBoard(boardId, "list:created", { list, state });
    return res.status(201).json(state);
  } catch (error) {
    return next(error);
  }
});

app.patch("/lists/:id", auth, async (req, res, next) => {
  try {
    const list = await List.findById(req.params.id);
    if (!list) return res.status(404).json({ message: "List not found" });
    await requireBoardMember(list.board, req.user.id);

    if (req.body.title !== undefined) list.title = req.body.title;
    if (req.body.position !== undefined) list.position = req.body.position;
    await list.save();

    const state = await loadBoard(list.board, req.user.id);
    emitBoard(list.board, "list:updated", { list, state });
    return res.json(state);
  } catch (error) {
    return next(error);
  }
});

app.post("/tasks", auth, async (req, res, next) => {
  try {
    const { boardId, listId, title, description = "", assignedTo = null, dueDate = null } = req.body;
    if (!boardId || !listId || !title) {
      return res.status(400).json({ message: "Board, list, and title are required" });
    }

    await requireBoardMember(boardId, req.user.id);
    const list = await List.findOne({ _id: listId, board: boardId });
    if (!list) return res.status(404).json({ message: "List not found" });

    if (assignedTo) await requireBoardMember(boardId, assignedTo);

    await Task.create({
      board: boardId,
      list: listId,
      title,
      description,
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      position: await nextTaskPosition(listId),
    });

    const state = await loadBoard(boardId, req.user.id);
    emitBoard(boardId, "task:created", state);
    return res.status(201).json(state);
  } catch (error) {
    return next(error);
  }
});

app.patch("/tasks/:id", auth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    await requireBoardMember(task.board, req.user.id);

    const nextListId = req.body.listId || task.list;
    const list = await List.findOne({ _id: nextListId, board: task.board });
    if (!list) return res.status(404).json({ message: "List not found" });

    if (req.body.assignedTo) await requireBoardMember(task.board, req.body.assignedTo);

    if (req.body.title !== undefined) task.title = req.body.title;
    if (req.body.description !== undefined) task.description = req.body.description;
    if (req.body.assignedTo !== undefined) task.assignedTo = req.body.assignedTo || null;
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate || null;
    if (req.body.listId !== undefined) task.list = req.body.listId;
    if (req.body.position !== undefined) task.position = req.body.position;
    await task.save();

    if (Array.isArray(req.body.order)) {
      await Promise.all(req.body.order.map((taskId, index) => (
        Task.updateOne({ _id: taskId, board: task.board }, { position: index })
      )));
    }

    const state = await loadBoard(task.board, req.user.id);
    emitBoard(task.board, "task:updated", state);
    return res.json(state);
  } catch (error) {
    return next(error);
  }
});

app.delete("/tasks/:id", auth, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });
    await requireBoardMember(task.board, req.user.id);

    const boardId = task.board.toString();
    await task.deleteOne();

    const state = await loadBoard(boardId, req.user.id);
    emitBoard(boardId, "task:deleted", state);
    return res.json(state);
  } catch (error) {
    return next(error);
  }
});

io.on("connection", (socket) => {
  socket.on("board:join", async ({ boardId, token }) => {
    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      await requireBoardMember(boardId, user.id);
      socket.join(`board:${boardId}`);
    } catch (error) {
      socket.emit("error:message", "Unable to join board updates");
    }
  });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  const message = status === 500 ? "Something went wrong" : error.message;
  if (status === 500) console.error(error);
  res.status(status).json({ message });
});

function startServer(port) {
  const handleError = (error) => {
    if (error.code === "EADDRINUSE") {
      const nextPort = Number(port) + 1;
      console.warn(`Port ${port} is already in use. Trying http://localhost:${nextPort}`);
      startServer(nextPort);
      return;
    }

    console.error("Server failed to start", error);
    process.exit(1);
  };

  server.once("error", handleError);
  server.listen(port, () => {
    server.removeListener("error", handleError);
    console.log(`Server running on http://localhost:${port}`);
  });
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
    startServer(PORT);
  })
  .catch((error) => {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  });
