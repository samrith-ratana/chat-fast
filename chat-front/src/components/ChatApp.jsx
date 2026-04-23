'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Send, Paperclip, Menu, ArrowLeft, MoreVertical, X } from 'lucide-react';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

const colorFor = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
};

const getInitials = (name) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const hashPassword = (pwd) => btoa(pwd + ':salt');

const initializeStorage = () => {
  if (!localStorage.getItem('wc_users')) {
    const defaultUsers = [
      {
        id: 'user_1',
        username: 'alex',
        displayName: 'Admin',
        password: hashPassword('alex123'),
      },
      {
        id: 'user_2',
        username: 'sara',
        displayName: 'Sara K.',
        password: hashPassword('sara123'),
      },
    ];
    localStorage.setItem('wc_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('wc_conversations')) {
    const defaultConvs = [
      {
        id: 'conv_general',
        type: 'channel',
        name: 'general',
        displayName: 'general',
        description: 'General discussion',
        members: ['user_1', 'user_2'],
        lastMessageAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 'conv_dev',
        type: 'channel',
        name: 'dev',
        displayName: 'dev',
        description: 'Development & code',
        members: ['user_1', 'user_2'],
        lastMessageAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 'conv_dm_1',
        type: 'dm',
        members: ['user_1', 'user_2'],
        lastMessageAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ];
    localStorage.setItem('wc_conversations', JSON.stringify(defaultConvs));
  }

  if (!localStorage.getItem('wc_messages_conv_general')) {
    const generalMessages = [
      {
        id: 'msg_1',
        sender: 'user_1',
        content: 'Hey everyone! Welcome to our chat platform.',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        read: true,
      },
      {
        id: 'msg_2',
        sender: 'user_2',
        content: 'Thanks for setting this up! Looks great.',
        timestamp: new Date(Date.now() - 86340000).toISOString(),
        read: true,
      },
      {
        id: 'msg_3',
        sender: 'user_1',
        content: 'We can use this for team collaboration',
        timestamp: new Date(Date.now() - 86300000).toISOString(),
        read: true,
      },
      {
        id: 'msg_4',
        sender: 'user_2',
        content: 'Perfect! I love the clean design. Very Telegram-like.',
        timestamp: new Date(Date.now() - 86250000).toISOString(),
        read: true,
      },
      {
        id: 'msg_5',
        sender: 'user_1',
        content: 'That was the goal. Simple, fast, and human.',
        timestamp: new Date(Date.now() - 86200000).toISOString(),
        read: true,
      },
      {
        id: 'msg_6',
        sender: 'user_2',
        content: 'Already impressed! 🚀',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        read: true,
      },
    ];
    localStorage.setItem('wc_messages_conv_general', JSON.stringify(generalMessages));
  }

  if (!localStorage.getItem('wc_messages_conv_dm_1')) {
    const dmMessages = [
      {
        id: 'dm_1',
        sender: 'user_1',
        content: 'Hey Sara, how are you?',
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        read: true,
      },
      {
        id: 'dm_2',
        sender: 'user_2',
        content: 'All good! Just testing the new chat.',
        timestamp: new Date(Date.now() - 7100000).toISOString(),
        read: true,
      },
      {
        id: 'dm_3',
        sender: 'user_1',
        content: 'Cool, let me know if you find any issues.',
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        read: true,
      },
      {
        id: 'dm_4',
        sender: 'user_2',
        content: 'Will do! Looks solid though.',
        timestamp: new Date(Date.now() - 1700000).toISOString(),
        read: true,
      },
    ];
    localStorage.setItem('wc_messages_conv_dm_1', JSON.stringify(dmMessages));
  }

  if (!localStorage.getItem('wc_messages_conv_dev')) {
    const devMessages = [
      {
        id: 'dev_1',
        sender: 'user_1',
        content: 'Who wants to discuss the API architecture?',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        read: true,
      },
      {
        id: 'dev_2',
        sender: 'user_2',
        content: 'I do! Let me finish this PR first.',
        timestamp: new Date(Date.now() - 172700000).toISOString(),
        read: true,
      },
    ];
    localStorage.setItem('wc_messages_conv_dev', JSON.stringify(devMessages));
  }
};

const App = () => {
  const [authState, setAuthState] = useState('loading');
  const [currentUser, setCurrentUser] = useState(null);
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ username: 'alex', password: 'alex123', displayName: '' });
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [newChannelModal, setNewChannelModal] = useState(false);
  const [newChannelForm, setNewChannelForm] = useState({ name: '', description: '' });
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const EMOJI_LIST = ['😀', '😂', '😍', '🔥', '👍', '🎉', '🚀', '💯', '❤️', '✨', '😎', '🙌'];

  useEffect(() => {
    initializeStorage();
    const sessionStr = localStorage.getItem('wc_session');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      setCurrentUser(session);
      setAuthState('authenticated');
      loadConversations(session);
    } else {
      setAuthState('unauthenticated');
    }
  }, []);

  const loadConversations = useCallback((user) => {
    const allConvs = JSON.parse(localStorage.getItem('wc_conversations') || '[]');
    const userConvs = allConvs.filter((c) => c.members.includes(user.id)).sort((a, b) => {
      const aTime = new Date(a.lastMessageAt).getTime();
      const bTime = new Date(b.lastMessageAt).getTime();
      return bTime - aTime;
    });
    setConversations(userConvs);
    if (userConvs.length > 0 && !selectedConvId) {
      setSelectedConvId(userConvs[0].id);
      loadMessages(userConvs[0].id);
    }
  }, [selectedConvId]);

  const loadMessages = (convId) => {
    const msgKey = `wc_messages_${convId}`;
    const msgs = JSON.parse(localStorage.getItem(msgKey) || '[]');
    setMessages(msgs);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
    }
  }, [selectedConvId]);

  const handleLogin = (e) => {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('wc_users') || '[]');
    const user = users.find(
      (u) =>
        u.username === formData.username &&
        u.password === hashPassword(formData.password)
    );
    if (user) {
      setCurrentUser(user);
      localStorage.setItem('wc_session', JSON.stringify(user));
      setAuthState('authenticated');
      loadConversations(user);
    } else {
      alert('Invalid credentials');
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    const users = JSON.parse(localStorage.getItem('wc_users') || '[]');
    if (users.find((u) => u.username === formData.username)) {
      alert('Username already exists');
      return;
    }
    const newUser = {
      id: `user_${Date.now()}`,
      username: formData.username,
      displayName: formData.displayName || formData.username,
      password: hashPassword(formData.password),
    };
    users.push(newUser);
    localStorage.setItem('wc_users', JSON.stringify(users));
    setCurrentUser(newUser);
    localStorage.setItem('wc_session', JSON.stringify(newUser));
    setAuthState('authenticated');
    loadConversations(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('wc_session');
    setCurrentUser(null);
    setAuthState('unauthenticated');
    setFormData({ username: 'alex', password: 'alex123', displayName: '' });
    setSelectedConvId(null);
    setMessages([]);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() && attachments.length === 0) return;
    if (!selectedConvId) return;

    const msgKey = `wc_messages_${selectedConvId}`;
    const existingMessages = JSON.parse(localStorage.getItem(msgKey) || '[]');
    const newMessage = {
      id: `msg_${Date.now()}`,
      sender: currentUser.id,
      content: inputValue.trim(),
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: new Date().toISOString(),
      read: true,
    };

    existingMessages.push(newMessage);
    localStorage.setItem(msgKey, JSON.stringify(existingMessages));

    const allConvs = JSON.parse(localStorage.getItem('wc_conversations') || '[]');
    const convIndex = allConvs.findIndex((c) => c.id === selectedConvId);
    if (convIndex !== -1) {
      allConvs[convIndex].lastMessageAt = new Date().toISOString();
      localStorage.setItem('wc_conversations', JSON.stringify(allConvs));
    }

    setMessages(existingMessages);
    setInputValue('');
    setAttachments([]);
    loadConversations(currentUser);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setAttachments([
        ...attachments,
        {
          id: `file_${Date.now()}`,
          name: file.name,
          type: file.type,
          data: evt.target.result,
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAttachment = (id) => {
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const handleCreateChannel = (e) => {
    e.preventDefault();
    if (!newChannelForm.name.trim()) return;
    const allConvs = JSON.parse(localStorage.getItem('wc_conversations') || '[]');
    const newConv = {
      id: `conv_${Date.now()}`,
      type: 'channel',
      name: newChannelForm.name.toLowerCase().replace(/\s+/g, '-'),
      displayName: newChannelForm.name,
      description: newChannelForm.description,
      members: [currentUser.id],
      lastMessageAt: new Date().toISOString(),
    };
    allConvs.push(newConv);
    localStorage.setItem('wc_conversations', JSON.stringify(allConvs));
    localStorage.setItem(`wc_messages_${newConv.id}`, JSON.stringify([]));
    setNewChannelForm({ name: '', description: '' });
    setNewChannelModal(false);
    loadConversations(currentUser);
  };

  const handleStartDM = (userId) => {
    if (userId === currentUser.id) return;
    const allConvs = JSON.parse(localStorage.getItem('wc_conversations') || '[]');
    let dmConv = allConvs.find(
      (c) =>
        c.type === 'dm' &&
        c.members.includes(currentUser.id) &&
        c.members.includes(userId)
    );
    if (!dmConv) {
      dmConv = {
        id: `conv_dm_${Date.now()}`,
        type: 'dm',
        members: [currentUser.id, userId],
        lastMessageAt: new Date().toISOString(),
      };
      allConvs.push(dmConv);
      localStorage.setItem('wc_conversations', JSON.stringify(allConvs));
      localStorage.setItem(`wc_messages_${dmConv.id}`, JSON.stringify([]));
    }
    setSelectedConvId(dmConv.id);
    loadConversations(currentUser);
  };

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const displayName = conv.displayName || conv.name || '';
    const lastMsg = messages.length > 0 ? messages[messages.length - 1].content : '';
    return displayName.toLowerCase().includes(query) || lastMsg.toLowerCase().includes(query);
  });

  const getConversationDisplayName = (conv) => {
    if (conv.displayName) return conv.displayName;
    if (conv.type === 'dm') {
      const otherUserId = conv.members.find((m) => m !== currentUser.id);
      const users = JSON.parse(localStorage.getItem('wc_users') || '[]');
      const otherUser = users.find((u) => u.id === otherUserId);
      return otherUser?.displayName || 'Unknown User';
    }
    return conv.name;
  };

  const getConversationLastMessage = (convId) => {
    const msgKey = `wc_messages_${convId}`;
    const msgs = JSON.parse(localStorage.getItem(msgKey) || '[]');
    if (msgs.length === 0) return '';
    const lastMsg = msgs[msgs.length - 1];
    const users = JSON.parse(localStorage.getItem('wc_users') || '[]');
    const sender = users.find((u) => u.id === lastMsg.sender);
    return `${sender?.displayName || 'User'}: ${lastMsg.content?.slice(0, 40) || '(media)'}...`;
  };

  const getConversationUnreadCount = (convId) => {
    const msgKey = `wc_messages_${convId}`;
    const msgs = JSON.parse(localStorage.getItem(msgKey) || '[]');
    return msgs.filter((m) => m.sender !== currentUser.id && !m.read).length;
  };

  const selectedConv = conversations.find((c) => c.id === selectedConvId);
  const selectedConvMessages = selectedConvId ? JSON.parse(localStorage.getItem(`wc_messages_${selectedConvId}`) || '[]') : [];
  const users = JSON.parse(localStorage.getItem('wc_users') || '[]');

  const groupedMessages = [];
  selectedConvMessages.forEach((msg, idx) => {
    const prevMsg = selectedConvMessages[idx - 1];
    const isSameSender = prevMsg && prevMsg.sender === msg.sender;
    const isRecent = prevMsg && new Date(msg.timestamp).getTime() - new Date(prevMsg.timestamp).getTime() < 120000;
    const shouldGroup = isSameSender && isRecent;

    if (shouldGroup) {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    } else {
      groupedMessages.push({
        sender: msg.sender,
        messages: [msg],
        showAvatar: true,
      });
    }
  });

  let currentDate = null;

  if (authState === 'loading') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Roboto, sans-serif' }}>Loading...</div>;
  }

  if (authState === 'unauthenticated') {
    return (
      <>
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap');
          html, body {
            background-color: #F1F1F1;
            font-family: 'Roboto', sans-serif;
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#F1F1F1', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '400px', backgroundColor: '#FFFFFF', borderRadius: '12px', padding: '40px', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: '#2AABEE', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: '500', color: '#FFFFFF' }}>W</div>
              <h1 style={{ fontSize: '20px', fontWeight: '500', color: '#000000' }}>WorkChat</h1>
            </div>
            <form onSubmit={isRegister ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {isRegister && (
                <input
                  type="text"
                  placeholder="Display Name"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: 'Roboto, sans-serif' }}
                />
              )}
              <input
                type="text"
                placeholder="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                style={{ width: '100%', padding: '12px 16px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: 'Roboto, sans-serif' }}
              />
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                style={{ width: '100%', padding: '12px 16px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: 'Roboto, sans-serif' }}
              />
              <button
                type="submit"
                style={{ width: '100%', padding: '12px 16px', backgroundColor: '#2AABEE', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', height: '48px' }}
              >
                {isRegister ? 'Register' : 'Login'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#707579' }}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setFormData({ username: 'alex', password: 'alex123', displayName: '' });
                }}
                style={{ backgroundColor: 'transparent', border: 'none', color: '#2AABEE', cursor: 'pointer', fontSize: '14px', fontWeight: '500', fontFamily: 'Roboto, sans-serif' }}
              >
                {isRegister ? 'Login' : 'Register'}
              </button>
            </div>
            <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#F1F1F1', borderRadius: '8px', fontSize: '12px', color: '#707579', lineHeight: '1.6' }}>
              <strong>Demo credentials:</strong>
              <br />
              Username: alex / Password: alex123
              <br />
              Username: sara / Password: sara123
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500&display=swap');
        html, body {
          background-color: #F1F1F1;
          font-family: 'Roboto', sans-serif;
        }
        input, textarea, button {
          font-family: 'Roboto', sans-serif;
        }
        input:focus, textarea:focus {
          outline: none;
        }
        textarea {
          resize: none;
          overflow-y: auto;
        }
      `}</style>
      <div style={{ display: 'flex', height: '100vh', backgroundColor: '#F1F1F1' }}>
        {/* SIDEBAR */}
        <div style={{ width: '320px', backgroundColor: '#FFFFFF', borderRight: '1px solid #E4E4E4', display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
          {/* Sidebar Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #E4E4E4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#2AABEE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '500', color: '#FFFFFF' }}>W</div>
              <span style={{ fontSize: '15px', fontWeight: '500', color: '#000000' }}>WorkChat</span>
            </div>
            <button
              onClick={() => setNewChannelModal(true)}
              style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#2AABEE', fontSize: '18px' }}
            >
              ✎
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ padding: '8px 16px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', color: '#A0A0A0' }} />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  backgroundColor: '#F1F1F1',
                  border: 'none',
                  borderRadius: '20px',
                  fontSize: '14px',
                  color: '#000000',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '12px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#A0A0A0' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Conversation List */}
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: '4px' }}>
            {filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConvId;
              const unreadCount = getConversationUnreadCount(conv.id);
              const lastMsg = getConversationLastMessage(conv.id);
              const displayName = getConversationDisplayName(conv);
              const otherUserId = conv.type === 'dm' ? conv.members.find((m) => m !== currentUser.id) : null;
              const otherUser = otherUserId ? users.find((u) => u.id === otherUserId) : null;

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    setSelectedConvId(conv.id);
                    loadMessages(conv.id);
                  }}
                  style={{
                    padding: '8px 16px',
                    height: '72px',
                    backgroundColor: isSelected ? '#F1F1F1' : '#FFFFFF',
                    borderBottom: '1px solid #E4E4E4',
                    cursor: 'pointer',
                    transition: 'background-color 80ms',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                    paddingTop: '10px',
                  }}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: colorFor(displayName),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontSize: '14px',
                        fontWeight: '500',
                      }}
                    >
                      {getInitials(displayName)}
                    </div>
                    {otherUser && <div style={{ position: 'absolute', width: '10px', height: '10px', backgroundColor: '#4DCD5E', borderRadius: '50%', bottom: '0', right: '0', border: '2px solid #FFFFFF' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#000000' }}>{displayName}</span>
                      <span style={{ fontSize: '12px', fontWeight: '300', color: '#A0A0A0', flexShrink: 0 }}>{formatTime(conv.lastMessageAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <p style={{ fontSize: '14px', color: '#707579', fontWeight: '300', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastMsg}</p>
                      {unreadCount > 0 && (
                        <div
                          style={{
                            backgroundColor: '#2AABEE',
                            color: '#FFFFFF',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '500',
                            flexShrink: 0,
                            animation: 'unreadBadge 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                          }}
                        >
                          {unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Logout Button */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E4E4E4' }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#2AABEE',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* CHAT AREA */}
        {selectedConv ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#F1F1F1' }}>
            {/* Topbar */}
            <div style={{ height: '56px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E4E4E4', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: colorFor(getConversationDisplayName(selectedConv)),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {getInitials(getConversationDisplayName(selectedConv))}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#000000' }}>{getConversationDisplayName(selectedConv)}</div>
                  <div style={{ fontSize: '12px', color: '#707579', fontWeight: '300' }}>online</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#2AABEE', fontSize: '18px' }}>🔍</button>
                <button style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#707579', fontSize: '18px' }}>⋮</button>
              </div>
            </div>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {groupedMessages.map((group, idx) => {
                const sender = users.find((u) => u.id === group.sender);
                const isSentByMe = group.sender === currentUser.id;
                const showDate = !currentDate || new Date(group.messages[0].timestamp).toDateString() !== currentDate;
                if (showDate) {
                  currentDate = new Date(group.messages[0].timestamp).toDateString();
                }

                return (
                  <div key={idx}>
                    {showDate && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '16px 0' }}>
                        <div style={{ backgroundColor: '#F1F1F1', padding: '4px 12px', borderRadius: '16px', fontSize: '12px', color: '#A0A0A0', fontWeight: '400' }}>
                          {formatDate(group.messages[0].timestamp)}
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px', flexDirection: isSentByMe ? 'row-reverse' : 'row' }}>
                      {!isSentByMe && group.showAvatar && (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            backgroundColor: colorFor(sender?.displayName || 'User'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            fontSize: '12px',
                            fontWeight: '500',
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(sender?.displayName || 'User')}
                        </div>
                      )}
                      {!isSentByMe && !group.showAvatar && <div style={{ width: '32px', flexShrink: 0 }} />}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                          alignItems: isSentByMe ? 'flex-end' : 'flex-start',
                          flex: 1,
                        }}
                      >
                        {selectedConv.type === 'channel' && !isSentByMe && group.showAvatar && (
                          <div style={{ fontSize: '13px', fontWeight: '500', color: '#2AABEE', paddingLeft: '8px' }}>{sender?.displayName || 'User'}</div>
                        )}
                        {group.messages.map((msg, msgIdx) => (
                          <div
                            key={msgIdx}
                            onMouseEnter={(e) => {}}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                            }}
                          >
                            {msg.attachments?.map((att) => (
                              <div
                                key={att.id}
                                style={{
                                  backgroundColor: isSentByMe ? '#EFFDDE' : '#FFFFFF',
                                  borderRadius: isSentByMe ? '16px 0 16px 16px' : '0 16px 16px 16px',
                                  padding: '4px',
                                  maxWidth: '260px',
                                  overflow: 'hidden',
                                }}
                              >
                                {att.type.startsWith('image/') ? (
                                  <img
                                    src={att.data}
                                    alt="Attachment"
                                    style={{
                                      width: '100%',
                                      height: 'auto',
                                      borderRadius: '12px',
                                      cursor: 'pointer',
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '8px',
                                      backgroundColor: isSentByMe ? '#EFFDDE' : '#FFFFFF',
                                      borderRadius: '8px',
                                    }}
                                  >
                                    <div style={{ fontSize: '18px' }}>📎</div>
                                    <div>
                                      <div style={{ fontSize: '12px', fontWeight: '500', color: '#000000' }}>{att.name}</div>
                                      <div style={{ fontSize: '11px', color: '#707579' }}>Download</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                            {msg.content && (
                              <div
                                style={{
                                  backgroundColor: isSentByMe ? '#EFFDDE' : '#FFFFFF',
                                  borderRadius: isSentByMe ? '16px 0 16px 16px' : '0 16px 16px 16px',
                                  padding: '8px 12px',
                                  wordWrap: 'break-word',
                                  maxWidth: '65%',
                                  fontSize: '14px',
                                  color: '#000000',
                                  fontWeight: '400',
                                  lineHeight: '1.4',
                                  animation: 'messageFadeIn 120ms ease-out',
                                }}
                              >
                                {msg.content}
                              </div>
                            )}
                            <div style={{ fontSize: '11px', color: '#707579', fontWeight: '300', paddingLeft: isSentByMe ? '0' : '8px', paddingRight: isSentByMe ? '8px' : '0' }}>
                              {formatTime(msg.timestamp)} {isSentByMe && '✓✓'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div style={{ backgroundColor: '#FFFFFF', borderTop: '1px solid #E4E4E4', padding: '12px 20px' }}>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {attachments.map((att) => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F1F1F1', padding: '6px 10px', borderRadius: '16px', fontSize: '12px' }}>
                      <span>{att.name.split('.').pop().toUpperCase()}</span>
                      <button
                        onClick={() => handleRemoveAttachment(att.id)}
                        style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#707579', fontSize: '14px' }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#2AABEE', fontSize: '18px', padding: '8px' }}
                >
                  <Paperclip size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  style={{
                    flex: 1,
                    backgroundColor: '#F1F1F1',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '10px 16px',
                    fontSize: '14px',
                    color: '#000000',
                    fontFamily: 'Roboto, sans-serif',
                    maxHeight: '120px',
                    minHeight: '40px',
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  style={{
                    backgroundColor: '#2AABEE',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#FFFFFF',
                    flexShrink: 0,
                    transition: 'transform 100ms',
                    padding: '0',
                  }}
                  onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.92)')}
                  onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F1F1' }}>
            <div style={{ textAlign: 'center', color: '#A0A0A0' }}>
              <div style={{ fontSize: '14px', fontWeight: '400' }}>Select a conversation to start</div>
            </div>
          </div>
        )}

        {/* Modal: New Channel */}
        {newChannelModal && (
          <div
            onClick={() => setNewChannelModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                padding: '24px',
                width: '90%',
                maxWidth: '400px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
            >
              <h2 style={{ fontSize: '16px', fontWeight: '500', marginBottom: '16px', color: '#000000' }}>Create Channel</h2>
              <form onSubmit={handleCreateChannel} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Channel name"
                  value={newChannelForm.name}
                  onChange={(e) => setNewChannelForm({ ...newChannelForm, name: e.target.value })}
                  style={{ padding: '12px 16px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: 'Roboto, sans-serif' }}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newChannelForm.description}
                  onChange={(e) => setNewChannelForm({ ...newChannelForm, description: e.target.value })}
                  rows={3}
                  style={{ padding: '12px 16px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontFamily: 'Roboto, sans-serif' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setNewChannelModal(false)}
                    style={{ flex: 1, padding: '12px', backgroundColor: '#F1F1F1', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: '#000000' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{ flex: 1, padding: '12px', backgroundColor: '#2AABEE', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes messageFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes unreadBadge {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }
      `}</style>
    </>
  );
};

export default App;
