import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const savedToken = localStorage.getItem("kanbanToken") || "";
const savedUser = JSON.parse(localStorage.getItem("kanbanUser") || "null");

const inputClass = "w-full rounded-xl border border-white/70 bg-white/90 px-4 py-3 text-sm text-ink shadow-sm outline-none transition focus:border-violet focus:ring-4 focus:ring-violet/15";
const labelClass = "grid gap-2 text-sm font-bold text-muted";
const primaryButton = "rounded-xl bg-gradient-to-r from-violet via-pink to-coral px-4 py-3 text-sm font-black text-white shadow-lg shadow-pink/25 transition hover:scale-[1.02]";
const secondaryButton = "rounded-xl bg-white px-4 py-3 text-sm font-black text-violet shadow-sm ring-1 ring-violet/15 transition hover:bg-violet/10";
const ghostButton = "rounded-xl px-4 py-3 text-sm font-black text-muted transition hover:bg-white hover:text-ink";

function App() {
  const [token, setToken] = useState(savedToken);
  const [user, setUser] = useState(savedUser);
  const [authMode, setAuthMode] = useState("login");
  const [boards, setBoards] = useState([]);
  const [current, setCurrent] = useState(null);
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [dragTaskId, setDragTaskId] = useState(null);

  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  };

  const loginUser = ({ token: nextToken, user: nextUser }) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem("kanbanToken", nextToken);
    localStorage.setItem("kanbanUser", JSON.stringify(nextUser));
  };

  const logout = () => {
    setToken("");
    setUser(null);
    setBoards([]);
    setCurrent(null);
    localStorage.removeItem("kanbanToken");
    localStorage.removeItem("kanbanUser");
  };

  const loadBoards = async () => {
    const data = await api("/boards");
    setBoards(data.boards);
    return data.boards;
  };

  const selectBoard = async (boardId) => {
    const data = await api(`/boards/${boardId}`);
    setCurrent(data);
  };

  useEffect(() => {
    if (!token) return;

    loadBoards()
      .then((items) => {
        if (items.length && !current) selectBoard(items[0].id);
      })
      .catch(logout);
  }, [token]);

  useEffect(() => {
    if (!token || !current?.board?.id) return undefined;

    const socket = io();
    socket.emit("board:join", { boardId: current.board.id, token });

    const syncState = (payload) => {
      setCurrent(payload.state || payload);
      loadBoards().catch(() => {});
    };

    ["board:updated", "list:created", "list:updated", "task:created", "task:updated", "task:deleted"].forEach((event) => {
      socket.on(event, syncState);
    });

    return () => socket.disconnect();
  }, [token, current?.board?.id]);

  const tasksByList = useMemo(() => {
    const grouped = {};
    current?.tasks?.forEach((task) => {
      grouped[task.list] = grouped[task.list] || [];
      grouped[task.list].push(task);
    });

    Object.values(grouped).forEach((tasks) => {
      tasks.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
    });

    return grouped;
  }, [current]);

  const boardStats = useMemo(() => {
    const tasks = current?.tasks || [];
    return {
      tasks: tasks.length,
      assigned: tasks.filter((task) => task.assignedTo).length,
      due: tasks.filter((task) => task.dueDate).length,
    };
  }, [current]);

  const handleAuth = async (event) => {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());

    try {
      const data = await api(`/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      loginUser(data);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createBoard = async (event) => {
    event.preventDefault();
    setMessage("");
    const name = new FormData(event.currentTarget).get("name").trim();
    if (!name) return;

    try {
      const data = await api("/boards", { method: "POST", body: JSON.stringify({ name }) });
      setCurrent(data);
      await loadBoards();
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const inviteMember = async (event) => {
    event.preventDefault();
    setMessage("");
    const email = new FormData(event.currentTarget).get("email").trim();

    try {
      const data = await api(`/boards/${current.board.id}/invite`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setCurrent(data);
      event.currentTarget.reset();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveList = async (title) => {
    if (!title) return;
    const data = await api("/lists", {
      method: "POST",
      body: JSON.stringify({ boardId: current.board.id, title }),
    });
    setCurrent(data);
    setModal(null);
  };

  const saveTask = async (task, payload) => {
    const data = task
      ? await api(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await api("/tasks", { method: "POST", body: JSON.stringify(payload) });

    setCurrent(data);
    setModal(null);
  };

  const deleteTask = async (taskId) => {
    const data = await api(`/tasks/${taskId}`, { method: "DELETE" });
    setCurrent(data);
    setModal(null);
  };

  const moveTask = async (taskId, listId, order) => {
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const data = await api(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ listId, position: order.indexOf(taskId), order }),
    });
    setCurrent(data);
  };

  const buildDropOrder = (lane, event, taskId) => {
    const cards = [...lane.querySelectorAll("[data-task-id]")].filter((card) => card.dataset.taskId !== taskId);
    const beforeCard = cards.find((card) => {
      const box = card.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2;
    });
    const ids = cards.map((card) => card.dataset.taskId);
    const index = beforeCard ? ids.indexOf(beforeCard.dataset.taskId) : ids.length;
    ids.splice(index, 0, taskId);
    return ids;
  };

  if (!token) {
    return (
      <AuthView
        authMode={authMode}
        message={message}
        onAuth={handleAuth}
        onModeChange={setAuthMode}
      />
    );
  }

  return (
    <section className="min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(236,72,153,0.20),transparent_24%),radial-gradient(circle_at_88%_12%,rgba(139,92,246,0.22),transparent_26%),radial-gradient(circle_at_45%_92%,rgba(45,212,191,0.24),transparent_30%),linear-gradient(135deg,#fff7ed,#f5f3ff_45%,#ecfeff)] text-ink">
      <div className="grid min-h-screen lg:grid-cols-[310px_1fr]">
        <aside className="flex flex-col gap-6 border-b border-white/70 bg-white/65 p-5 shadow-xl shadow-violet/10 backdrop-blur-xl lg:border-b-0 lg:border-r">
          <Brand />

          <form className="flex gap-2" onSubmit={createBoard}>
            <input className={inputClass} name="name" placeholder="New board" required />
            <button className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-sun via-orange to-pink text-2xl font-black text-white shadow-lg shadow-orange/25 transition hover:scale-105" type="submit" title="Create board">
              +
            </button>
          </form>

          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-muted">Boards</p>
            <div className="grid gap-2">
              {boards.map((board) => (
                <button
                  className={`group flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                    current?.board?.id === board.id
                      ? "bg-gradient-to-r from-violet to-pink text-white shadow-lg shadow-pink/20"
                      : "bg-white/75 text-ink ring-1 ring-white/80 hover:bg-white hover:ring-violet/20"
                  }`}
                  key={board.id}
                  type="button"
                  onClick={() => selectBoard(board.id)}
                >
                  <span className="truncate">{board.name}</span>
                  <span className={`ml-3 h-2.5 w-2.5 rounded-full ${current?.board?.id === board.id ? "bg-sun" : "bg-mint group-hover:bg-pink"}`} />
                </button>
              ))}
              {!boards.length && (
                <div className="rounded-2xl border border-dashed border-line bg-white/60 p-4 text-sm font-semibold text-muted">
                  Create your first board to start planning.
                </div>
              )}
            </div>
          </div>

          <div className="mt-auto rounded-3xl border border-white/80 bg-gradient-to-br from-white via-pink/10 to-sky/10 p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted">Signed in</p>
            <p className="mt-1 truncate text-base font-black text-ink">{user?.name || "User"}</p>
            <button className={`${ghostButton} mt-3 w-full bg-white/80`} type="button" onClick={logout}>Logout</button>
          </div>
        </aside>

        <section className="grid min-w-0 grid-rows-[auto_1fr]">
          <header className="border-b border-white/70 bg-white/60 px-5 py-5 shadow-sm backdrop-blur-xl md:px-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-violet">Workspace</p>
                <h1 className="mt-1 bg-gradient-to-r from-violet via-pink to-orange bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">{current?.board?.name || "Boards"}</h1>
                <p className="mt-2 text-sm font-semibold text-muted">
                  {current ? `${current.board.members.length} member${current.board.members.length === 1 ? "" : "s"} collaborating in real time` : "Create a board to begin"}
                </p>
              </div>

              {current && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="Tasks" value={boardStats.tasks} tone="from-sky/20 to-violet/20 text-sky" />
                    <Stat label="Assigned" value={boardStats.assigned} tone="from-mint/20 to-spruce/15 text-spruce" />
                    <Stat label="Due" value={boardStats.due} tone="from-sun/30 to-orange/20 text-orange" />
                  </div>
                  <form className="flex gap-2" onSubmit={inviteMember}>
                    <input className={`${inputClass} md:w-56`} name="email" type="email" placeholder="Member email" required />
                    <button className={secondaryButton} type="submit">Invite</button>
                  </form>
                  <button className={primaryButton} type="button" onClick={() => setModal({ type: "list" })}>New list</button>
                </div>
              )}
            </div>
          </header>

          <main className="min-w-0 overflow-x-auto p-5 md:p-8">
            {current ? (
              <div className="grid min-h-[calc(100vh-170px)] auto-cols-[minmax(290px,330px)] grid-flow-col items-start gap-5">
                {current.lists.map((list, index) => {
                  const tasks = tasksByList[list.id] || [];
                  return (
                    <section className={`rounded-3xl border border-white/75 bg-gradient-to-br ${columnSurface(index)} p-3 shadow-xl shadow-ink/5 backdrop-blur`} key={list.id}>
                      <div className="mb-3 flex items-center justify-between px-2 pt-1">
                        <div className="flex items-center gap-3">
                          <span className={`h-3 w-3 rounded-full ${columnDot(index)}`} />
                          <h2 className="text-base font-black text-ink">{list.title}</h2>
                        </div>
                        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-2 text-xs font-black text-muted shadow-sm ring-1 ring-line">
                          {tasks.length}
                        </span>
                      </div>

                      <div
                        className="grid min-h-28 content-start gap-3 rounded-2xl p-1 transition"
                        data-list-id={list.id}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.currentTarget.classList.add("drag-over");
                        }}
                        onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.currentTarget.classList.remove("drag-over");
                          moveTask(dragTaskId, list.id, buildDropOrder(event.currentTarget, event, dragTaskId));
                        }}
                      >
                        {tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            onOpen={() => setModal({ type: "task", task, listId: task.list })}
                            onDragStart={() => setDragTaskId(task.id)}
                            onDragEnd={() => setDragTaskId(null)}
                          />
                        ))}
                        {!tasks.length && (
                          <div className="rounded-2xl border border-dashed border-line bg-white/50 p-5 text-center text-sm font-bold text-muted">
                            Drop tasks here
                          </div>
                        )}
                      </div>

                      <button className={`${secondaryButton} mt-3 w-full`} type="button" onClick={() => setModal({ type: "task", listId: list.id })}>
                        Add task
                      </button>
                    </section>
                  );
                })}
              </div>
            ) : (
              <EmptyBoard />
            )}
            {message && <div className="mt-4 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-black text-coral">{message}</div>}
          </main>
        </section>
      </div>

      {modal?.type === "list" && <ListModal onClose={() => setModal(null)} onSave={saveList} />}
      {modal?.type === "task" && (
        <TaskModal
          board={current.board}
          listId={modal.listId}
          task={modal.task}
          onClose={() => setModal(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      )}
    </section>
  );
}

function AuthView({ authMode, message, onAuth, onModeChange }) {
  const isLogin = authMode === "login";

  return (
    <section className="grid min-h-screen bg-[radial-gradient(circle_at_16%_18%,rgba(236,72,153,0.26),transparent_25%),radial-gradient(circle_at_78%_12%,rgba(139,92,246,0.24),transparent_28%),radial-gradient(circle_at_44%_88%,rgba(45,212,191,0.24),transparent_30%),linear-gradient(135deg,#fff7ed,#fdf2f8_38%,#eef2ff_72%,#ecfeff)] p-5 text-ink lg:grid-cols-[1fr_420px] lg:items-center lg:gap-16 lg:p-12">
      <div className="mx-auto w-full max-w-3xl">
        <Brand />
        <div className="mt-14 max-w-2xl">
          <p className="mb-4 inline-flex rounded-full bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-violet shadow-sm ring-1 ring-white/70">
            Real-time Kanban
          </p>
          <h1 className="bg-gradient-to-r from-violet via-pink to-orange bg-clip-text text-5xl font-black leading-[0.94] tracking-tight text-transparent md:text-7xl">
            Plan work with a board that feels alive.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-semibold leading-8 text-muted">
            Create boards, invite members, assign tasks, set due dates, and watch every update sync instantly.
          </p>
        </div>
        <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
          <FeatureCard title="Live sync" body="Socket updates for every board." />
          <FeatureCard title="Drag tasks" body="Move cards between lists." />
          <FeatureCard title="Teams" body="Invite members by email." />
        </div>
      </div>

      <form className="mx-auto mt-10 w-full max-w-md rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-2xl shadow-pink/15 backdrop-blur-xl lg:mt-0" onSubmit={onAuth}>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gradient-to-r from-violet/10 via-pink/10 to-orange/10 p-1">
          <button className={`rounded-xl px-4 py-3 text-sm font-black transition ${isLogin ? "bg-white text-violet shadow-sm" : "text-muted hover:text-ink"}`} type="button" onClick={() => onModeChange("login")}>Login</button>
          <button className={`rounded-xl px-4 py-3 text-sm font-black transition ${!isLogin ? "bg-white text-pink shadow-sm" : "text-muted hover:text-ink"}`} type="button" onClick={() => onModeChange("register")}>Register</button>
        </div>

        <div className="mt-6 grid gap-4">
          {!isLogin && (
            <label className={labelClass}>
              Name
              <input className={inputClass} name="name" autoComplete="name" required />
            </label>
          )}
          <label className={labelClass}>
            Email
            <input className={inputClass} name="email" type="email" autoComplete="email" required />
          </label>
          <label className={labelClass}>
            Password
            <input className={inputClass} name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength="6" />
          </label>
        </div>

        <button className={`${primaryButton} mt-6 w-full`} type="submit">{isLogin ? "Login" : "Create account"}</button>
        {message && <div className="mt-4 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-black text-coral">{message}</div>}
      </form>
    </section>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#f5c84c,#fb923c_28%,#ec4899_56%,#8b5cf6)] shadow-lg shadow-pink/20">
        <span className="h-5 w-6 rounded border-2 border-white/95 border-t-0" />
      </span>
      <span className="bg-gradient-to-r from-ink to-violet bg-clip-text text-xl font-black tracking-tight text-transparent">Kanban Board</span>
    </div>
  );
}

function FeatureCard({ title, body }) {
  return (
    <div className="rounded-3xl border border-white/70 bg-gradient-to-br from-white/80 to-white/45 p-4 shadow-lg shadow-pink/10 backdrop-blur">
      <p className="font-black text-ink">{title}</p>
      <p className="mt-1 text-sm font-semibold text-muted">{body}</p>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`min-w-20 rounded-2xl bg-gradient-to-br ${tone} px-4 py-3 text-center shadow-sm ring-1 ring-white/70`}>
      <p className="text-lg font-black leading-none">{value}</p>
      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.16em] text-muted">{label}</p>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="grid min-h-[55vh] place-items-center">
      <div className="max-w-md rounded-[2rem] border border-dashed border-line bg-white/70 p-8 text-center shadow-xl shadow-ink/5">
        <p className="text-2xl font-black text-ink">No board selected</p>
        <p className="mt-3 text-sm font-semibold leading-6 text-muted">
          Create a board from the sidebar. It will start with To Do, In Progress, and Done columns.
        </p>
      </div>
    </div>
  );
}

function TaskCard({ task, onOpen, onDragStart, onDragEnd }) {
  return (
    <article
      className="group cursor-grab rounded-2xl border border-white/80 bg-white p-4 shadow-md shadow-ink/5 transition hover:-translate-y-0.5 hover:border-pink/30 hover:shadow-xl hover:shadow-pink/10 active:cursor-grabbing"
      draggable
      data-task-id={task.id}
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="break-words text-sm font-black leading-5 text-ink">{task.title}</p>
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-pink to-violet transition group-hover:from-sun group-hover:to-orange" />
      </div>
      {task.description && <p className="mb-4 line-clamp-3 break-words text-sm font-semibold leading-6 text-muted">{task.description}</p>}
      <div className="flex flex-wrap gap-2">
        {task.assignedTo && <span className="rounded-full bg-gradient-to-r from-sky/15 to-violet/15 px-3 py-1 text-xs font-black text-violet">{task.assignedTo.name}</span>}
        {task.dueDate && <span className="rounded-full bg-gradient-to-r from-sun/25 to-orange/20 px-3 py-1 text-xs font-black text-orange">{formatDate(task.dueDate)}</span>}
      </div>
    </article>
  );
}

function ListModal({ onClose, onSave }) {
  const [title, setTitle] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-5 backdrop-blur-sm">
      <form className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl shadow-ink/20" onSubmit={(event) => {
        event.preventDefault();
        onSave(title.trim());
      }}>
        <h2 className="text-2xl font-black text-ink">New list</h2>
        <label className={`${labelClass} mt-5`}>
          Title
          <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button className={ghostButton} type="button" onClick={onClose}>Cancel</button>
          <button className={primaryButton} type="submit">Create</button>
        </div>
      </form>
    </div>
  );
}

function TaskModal({ board, listId, task, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    assignedTo: task?.assignedTo?.id || "",
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
  });

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-5 backdrop-blur-sm">
      <form className="w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl shadow-ink/20" onSubmit={(event) => {
        event.preventDefault();
        onSave(task, { ...form, boardId: board.id, listId });
      }}>
        <h2 className="text-2xl font-black text-ink">{task ? "Edit task" : "New task"}</h2>
        <div className="mt-5 grid gap-4">
          <label className={labelClass}>
            Title
            <input className={inputClass} value={form.title} onChange={(event) => update("title", event.target.value)} required />
          </label>
          <label className={labelClass}>
            Description
            <textarea className={`${inputClass} min-h-28 resize-y`} value={form.description} onChange={(event) => update("description", event.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Assigned to
              <select className={inputClass} value={form.assignedTo} onChange={(event) => update("assignedTo", event.target.value)}>
                <option value="">Unassigned</option>
                {board.members.map((member) => (
                  <option value={member.id} key={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Due date
              <input className={inputClass} type="date" value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {task && <button className="rounded-xl bg-coral/10 px-4 py-3 text-sm font-black text-coral transition hover:bg-coral/15" type="button" onClick={() => onDelete(task.id)}>Delete</button>}
          <button className={ghostButton} type="button" onClick={onClose}>Cancel</button>
          <button className={primaryButton} type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}

function columnDot(index) {
  return ["bg-sun", "bg-sky", "bg-mint", "bg-pink", "bg-orange", "bg-violet"][index % 6];
}

function columnSurface(index) {
  return [
    "from-sun/20 via-white/70 to-orange/10",
    "from-sky/18 via-white/70 to-violet/10",
    "from-mint/20 via-white/70 to-spruce/10",
    "from-pink/18 via-white/70 to-coral/10",
    "from-orange/18 via-white/70 to-sun/15",
    "from-violet/18 via-white/70 to-sky/10",
  ][index % 6];
}

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

createRoot(document.getElementById("root")).render(<App />);
