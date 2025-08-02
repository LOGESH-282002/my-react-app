import React, { useState, useRef, useEffect } from "react";
import "./Chatbot.css";
const BOT_NAME = "Zen";
const BOT_GREETING = "Hi there! I'm Zen, your personal assistant. How can I help you today?";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`;

function truncateFileName(name, maxLength = 16) {
  if (!name || name.length <= maxLength) return name;
  return name.slice(0, 8) + '...' + name.slice(-4);
}

const Chatbot = () => {
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('chat-messages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [{ role: 'bot', content: BOT_GREETING }];
  });
  const [input, setInput] = useState("");
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('chatbot-theme');
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });
  const chatBodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('chatbot-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('chat-messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      setFileData(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setFileData({
        data: e.target.result.split(",")[1],
        mime_type: file.type,
        name: file.name
      });
      if (file.type.startsWith("image/")) {
        setFilePreview(<img src={e.target.result} alt={file.name} className="file-preview-image" />);
      } else {
        setFilePreview(truncateFileName(file.name));
      }
    };
    reader.readAsDataURL(file);
  }, [file]);

  const handleThemeToggle = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const handleNewChat = () => {
    setMessages([{ role: 'bot', content: BOT_GREETING }]);
    localStorage.removeItem('chat-messages');
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current.click();
  };
  
  const handleFileChange = e => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };
  
  const handleRemoveFile = () => {
    setFile(null);
    setFilePreview(null);
    setFileData(null);
  };

  const handleInputChange = e => {
    setInput(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxRows = 3, lineHeight = 24;
      const scrollHeight = textarea.scrollHeight;
      if (scrollHeight <= maxRows * lineHeight + 8) {
        textarea.style.overflowY = 'hidden';
        textarea.style.height = scrollHeight + 'px';
      } else {
        textarea.style.overflowY = 'auto';
        textarea.style.height = (maxRows * lineHeight) + 'px';
      }
    }
  };

  const handleInputKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async e => {
    if (e) e.preventDefault();
    if (!input.trim() && !fileData) return;
    let messageToSend = input;
    if (fileData && !fileData.mime_type.startsWith('image/')) {
      messageToSend = `[FILE] ${fileData.name}\n` + input;
    }
    const newMessages = [...messages, { role: 'user', content: messageToSend, file: fileData }];
    setMessages(newMessages);
    setInput("");
    setFile(null);
    setFilePreview(null);
    setFileData(null);
    setLoading(true);
    
    const history = newMessages.filter(m => !m.thinking).map(m => {
      const parts = [{ text: m.content }];
      if (m.role === 'user' && m.file) {
        parts.push({ inline_data: { mime_type: m.file.mime_type, data: m.file.data } });
        if (!parts[0].text) parts[0].text = "Please describe the contents of this file.";
      }
      return { role: m.role === 'user' ? 'user' : 'model', parts };
    });
    const systemInstruction = {
      parts: [{ text: `You are a user friendly "AI assistant"  ${BOT_NAME}.` }]
    };
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: history, systemInstruction })
      });
      const data = await response.json();
      let botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I'm having a little trouble understanding. Could you try rephrasing?";
      botReply = botReply.replace(/\*\*\*(.*?)\*\*\*/g, "<strong>$1</strong>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/__(.*?)__/g, "<u>$1</u>")
        .replace(/`(.*?)`/g, "<code>$1</code>").trim();
      setMessages(msgs => [...msgs, { role: 'bot', content: botReply }]);
    } catch (error) {
      console.error("API Error:", error);
      setMessages(msgs => [...msgs, { role: 'bot', content: 'Error: Could not get response.' }]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg, i) => {
    if (msg.role === 'user') {
      let displayContent = msg.content;
      if (msg.file && !msg.file.mime_type.startsWith('image/')) {
        displayContent = displayContent.replace(/^\[FILE\].*\n?/, '');
      }
      return (
        <div className="message user-message" key={i}>
          <div className="message-bubble user-bubble">
            {msg.file && msg.file.mime_type.startsWith('image/') && (
              <img src={`data:${msg.file.mime_type};base64,${msg.file.data}`} alt="Uploaded" className="uploaded-image" />
            )}
            {msg.file && !msg.file.mime_type.startsWith('image/') && (
              <div className="file-attachment">
                <span className="file-icon">📎</span>
                <span className="file-name">{truncateFileName(msg.file.name)}</span>
              </div>
            )}
            <div className="message-content" dangerouslySetInnerHTML={{ __html: displayContent.replace(/\n/g, '<br>') }} />
          </div>
        </div>
      );
    } else if (msg.role === 'bot') {
      return (
        <div className="message bot-message" key={i}>
          <div className="bot-avatar">
            <div className="avatar-icon">🤖</div>
          </div>
          <div className="message-bubble bot-bubble">
            <div className="message-content" dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br>') }} />
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`chatbot-container ${theme}`}>
      <div className="chat-header">Chatbot</div>
      <div className="top-bar">
        <button className="new-chat-btn" title="Start new chat" onClick={handleNewChat}>
          🗨️ New Chat
        </button>
        <button className="mode-toggle" title="Toggle dark/light mode" onClick={handleThemeToggle}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="chat-messages" ref={chatBodyRef}>
        {messages.map((msg, i) => renderMessage(msg, i))}
        {loading && (
          <div className="message bot-message thinking">
            <div className="bot-avatar">
              <div className="avatar-icon">🤖</div>
            </div>
            <div className="message-bubble bot-bubble">
              <div className="loader-dots">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          </div>
        )}
      </div>
      <form className="chat-input-area" onSubmit={handleSubmit} autoComplete="off">
        <button
          type="button"
          id="upload-btn"
          title="Upload"
          onClick={handleUploadClick}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
          >
            <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm280-120h80v-168l64 64 56-56-160-160-160 160 56 56 64-64v168Z" />
          </svg>
        </button>
        <input
          type="file"
          id="file-input"
          accept=".txt,.pdf,.docx,.jpg,.png,.jpeg,.gif"
          style={{ display: "none" }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <div className="input-wrapper">
          {filePreview && (
            <div id="file-preview">
              {filePreview}
              <button type="button" title="Remove file" onClick={handleRemoveFile}>✖</button>
            </div>
          )}
          <textarea
            className="user-input"
            id="user-input"
            placeholder="Type your message..."
            autoComplete="off"
            autoFocus
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            ref={textareaRef}
          />
        </div>
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default Chatbot;