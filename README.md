# KIRO

### Your day, understood.

- see V1 Features [KIRO V1 Documentation](V1_README.md) 

KIRO is a personal AI productivity assistant designed to help you manage tasks, organize your day, and stay ahead of important deadlines through natural voice and chat interaction.

Instead of manually creating every task, simply tell KIRO what you need to do. It understands your request, organizes the details, and helps you remember what matters.

> Speak naturally. Stay organized. Make space for what matters.

---

## ✨ Features

### 🤖 AI-Powered Assistant
- Interact with KIRO using natural language
- Create tasks through simple conversations
- Ask about upcoming deadlines and daily priorities
- Get assistance organizing your day
- Convert conversational requests into structured tasks

### 🎙️ Voice Interaction
- Create tasks using voice commands
- Speech-to-text input
- AI responses with text-to-speech
- Interactive assistant listening and thinking states
- Voice controls with graceful browser compatibility handling

### ⏰ Smart Reminders
- Priority-based reminder scheduling
- Important deadline notifications
- Custom reminder intervals
- Snooze reminders
- Mark tasks as completed directly from reminder actions
- Overdue task tracking

### 📋 Task Management
- Create, edit and delete tasks
- Set due dates and times
- Organize tasks by category and priority
- Track completed and pending tasks
- Filter tasks by status and deadline

### 🎨 Modern UI/UX
- Premium dark interface
- Animated AI assistant orb
- Smooth transitions and microinteractions
- Responsive dashboard
- Clean task cards and visual progress tracking
- Designed for desktop, tablet and mobile

### 🔐 Secure User Accounts
- User authentication
- Personal task storage
- User-specific data access
- Supabase Row Level Security

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| HTML, CSS, JavaScript | Frontend |
| Supabase | Authentication and database |
| PostgreSQL | Persistent data storage |
| AI API | Natural language understanding |
| Web Speech API | Voice input and spoken responses |
| Service Worker | Browser notification support |
| Vercel | Frontend deployment |
| Cloudflare Workers / scheduled backend | Reminder processing |

---

## 🧠 How KIRO Works

1. The user speaks or types a task.
2. KIRO interprets the request using AI.
3. Important details such as task name, date, time and priority are extracted.
4. The task is saved to the user's account.
5. The reminder engine schedules notifications.
6. The user receives reminders and can complete or snooze the task.

### Example

**You:** "Remind me to submit my assignment tomorrow at 9 AM."

**KIRO understands:**
- Task: Submit assignment
- Due date: Tomorrow
- Time: 9:00 AM
- Priority: Medium
- Reminder: Enabled

KIRO then creates the task and schedules the reminder.

---

## 🚀 Getting Started

### Prerequisites

- Node.js and npm, if using a local development server or build tooling
- A Supabase project
- An AI provider API key
- A modern browser with voice support for voice features

### 1. Clone the repository

```bash
git clone https://github.com/PythosX/KIRO.git
cd KIRO
```

### 2. Configure environment variables

Create a `.env` file using the provided `.env.example`.

Example configuration:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key

AI_API_KEY=your_ai_provider_key
AI_MODEL=your_configured_model
```

Use the exact variable names required by the project configuration.

**Never commit real API keys or secrets to GitHub.**

### 3. Set up Supabase

1. Create a Supabase project.
2. Configure authentication.
3. Create the required database tables.
4. Apply the SQL schema provided in the project.
5. Enable Row Level Security.
6. Configure policies so users can only access their own data.

### 4. Run locally

For a static HTML/CSS/JavaScript project, use a local development server.

For example:

```bash
npx serve .
```

Open the local URL displayed by the server.

### 5. Deploy

Deploy the frontend using Vercel and configure the required environment variables.

Set up the scheduled backend worker separately for reliable reminder processing.

---

## 📱 Browser Compatibility

KIRO uses modern browser capabilities for voice and notifications.

Some features depend on browser support and user permissions:

- Speech recognition availability varies by browser.
- Microphone access requires permission.
- Notifications require permission.
- Push notifications require appropriate service-worker and backend configuration.

KIRO does not rely on continuous background listening.

---

## 🔮 Future Roadmap

- Calendar integration
- Native mobile application
- Location-based reminders
- Advanced daily planning
- Personal productivity insights
- More voice assistant capabilities
- Additional integrations

---

## 🎯 Project Goal

KIRO aims to make personal productivity feel effortless.

The idea is simple: users should spend less time organizing tasks and more time completing them.

KIRO brings tasks, conversations and reminders together in one intelligent workspace.

---

## 👨‍💻 Developer

Developed by **PythosX**

GitHub: [github.com/PythosX](https://github.com/PythosX)

---

## 📄 License

This project is intended for learning, experimentation and personal productivity.

Add a license file to the repository if you plan to distribute or open-source the project.
