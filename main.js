import { createClient } from '@supabase/supabase-js';

// --- Utilities ---
const Utils = {
    escapeHtml: (unsafe) => (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                                         .replace(/"/g, "&quot;").replace(/'/g, "&#039;"),
    formatDate: (timestamp) => new Date(timestamp).toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
};

// --- Application State ---
const AppState = {
    _state: {
        supabase: null,
        user: null,
        token: null,
        isRecording: false
    },
    update(newState) {
        this._state = { ...this._state, ...newState };
    },
    get() {
        return this._state;
    }
};

// --- HTTP Client ---
const HttpClient = {
    async request(url, options = {}) {
        const { token } = AppState.get();
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Request failed with status ${response.status}`);
        }
        return response.json();
    }
};

// --- UI Controller ---
const UI = {
    elements: {},
    
    init() {
        const ids = [
            'login-section', 'app-content', 'email-input', 'password-input', 'auth-error',
            'logged-in-user', 'user-avatar', 'avatar-input', 'avatar-change-btn',
            'chat-box', 'chat-input', 'send-chat-btn', 'chat-image-input', 'chat-image-btn', 
            'status-dot', 'status-text', 'voice-btn'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.elements[id.replace(/-([a-z])/g, (g) => g[1].toUpperCase())] = el;
        });
    },

    updateAuthView(session) {
        const isLoggedIn = !!session;
        this.elements.loginSection.style.display = isLoggedIn ? 'none' : 'flex';
        this.elements.appContent.style.display = isLoggedIn ? 'block' : 'none';
        if (isLoggedIn) {
            this.elements.loggedInUser.textContent = session.user.email;
            this.elements.authError.style.display = 'none';
        }
    },

    showError(message, target = 'authError') {
        const el = this.elements[target] || this.elements.authError;
        if (el) {
            el.textContent = message;
            el.style.display = 'block';
        }
    },

    renderChatMessage(data, isMe) {
        const { user_email, content, created_at, avatar_url } = data;
        const msgEl = document.createElement('div');
        msgEl.className = `chat-msg ${isMe ? 'me' : 'others'}`;
        
        const time = new Date(created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const displayAvatar = avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user_email)}&background=random`;

        const imageRegex = /!\[image\]\((.*?)\)/;
        const imageMatch = content.match(imageRegex);
        
        let displayContent = Utils.escapeHtml(content);
        if (imageMatch) {
            const imageUrl = imageMatch[1];
            displayContent = `<img src="${imageUrl}" alt="Shared Image" 
                onclick="window.open('${imageUrl}', '_blank')" 
                onerror="this.parentElement.innerHTML='<div style=\'font-size: 12px; color: #ef4444; padding: 10px; border: 1px dashed #ef4444; border-radius: 8px;\'>⚠️ 이미지를 불러올 수 없습니다.</div>';">`;
        } else if (content.startsWith('http') && (content.includes('supabase') || content.match(/\.(jpeg|jpg|gif|png)$/))) {
            displayContent = `<img src="${content}" alt="Shared Image" onclick="window.open('${content}', '_blank')">`;
        }

        msgEl.innerHTML = `
            <div class="chat-msg-avatar">
                <img src="${displayAvatar}" alt="Profile">
            </div>
            <div class="chat-msg-body">
                <span class="chat-msg-user">${Utils.escapeHtml(user_email)}</span>
                <div class="chat-msg-content">
                    ${displayContent}
                </div>
                <span class="chat-msg-time">${time}</span>
            </div>
        `;
        
        this.elements.chatBox.appendChild(msgEl);
        this.elements.chatBox.scrollTop = this.elements.chatBox.scrollHeight;
        
        const emptyMsg = this.elements.chatBox.querySelector('.chat-empty-msg');
        if (emptyMsg) emptyMsg.style.display = 'none';
    },

    updateChatStatus(status, color) {
        if (this.elements.statusDot) {
            this.elements.statusDot.style.background = color;
            this.elements.statusDot.style.boxShadow = `0 0 10px ${color}`;
        }
        if (this.elements.statusText) this.elements.statusText.innerText = status;
    },

    toggleRecording(isRecording) {
        if (this.elements.voiceBtn) {
            this.elements.voiceBtn.classList.toggle('recording', isRecording);
            if (isRecording) {
                this.elements.voiceBtn.style.color = 'var(--accent-vivid)';
                this.elements.voiceBtn.style.filter = 'drop-shadow(0 0 8px var(--accent-vivid))';
            } else {
                this.elements.voiceBtn.style.color = '';
                this.elements.voiceBtn.style.filter = '';
            }
        }
    }
};

// --- Services ---
const NotificationService = {
    // 맑은 신호음 URL
    soundUrl: 'https://assets.mixkit.co/active_storage/sfx/2859/2859-preview.mp3',
    audio: null,

    init() {
        this.audio = new Audio(this.soundUrl);
    },

    playSound() {
        if (this.audio) {
            this.audio.currentTime = 0;
            this.audio.play().catch(e => console.warn("알림음 재생 실패 (브라우저 정책):", e));
        }
    }
};

const SpeechService = {
    recognition: null,
    
    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'ko-KR';
        this.recognition.interimResults = true;

        this.recognition.onstart = () => {
            AppState.update({ isRecording: true });
            UI.toggleRecording(true);
        };

        this.recognition.onresult = (e) => {
            let interim = '', final = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
                else interim += e.results[i][0].transcript;
            }
            const current = UI.elements.chatInput.value;
            UI.elements.chatInput.value = current.trim() + ' ' + (final + interim).trim();
        };

        this.recognition.onend = () => {
            AppState.update({ isRecording: false });
            UI.toggleRecording(false);
        };

        this.recognition.onerror = () => {
            AppState.update({ isRecording: false });
            UI.toggleRecording(false);
        };
    },

    async toggle() {
        if (!this.recognition) return alert('음성 인식을 지원하지 않습니다.');
        if (AppState.get().isRecording) {
            this.recognition.stop();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                this.recognition.start();
            } catch (e) {
                alert('마이크 접근 권한을 허용해주세요.');
            }
        }
    }
};

const AuthService = {
    async init() {
        try {
            const { supabaseUrl, supabaseAnonKey } = await HttpClient.request('/api/env');
            AppState.update({ supabase: createClient(supabaseUrl, supabaseAnonKey) });
            
            const supabase = AppState.get().supabase;
            supabase.auth.onAuthStateChange((_, session) => this.handleSession(session));
            
            const { data: { session } } = await supabase.auth.getSession();
            this.handleSession(session);
        } catch (e) {
            UI.showError("서버 설정을 불러올 수 없습니다.");
        }
    },

    handleSession(session) {
        AppState.update({ user: session?.user || null, token: session?.access_token || null });
        UI.updateAuthView(session);
        if (session) {
            ProfileService.loadAvatar();
            ChatService.init();
        }
    },

    async login(email, password) {
        const { error } = await AppState.get().supabase.auth.signInWithPassword({ email, password });
        if (error) UI.showError(error.message.includes('Invalid') ? '이메일 또는 비밀번호가 틀렸습니다.' : error.message);
    },

    async signup(email, password) {
        const { error } = await AppState.get().supabase.auth.signUp({ email, password });
        if (error) UI.showError(error.message);
        else alert("가입 확인 이메일을 확인해주세요!");
    },

    async googleLogin() {
        await AppState.get().supabase.auth.signInWithOAuth({
            provider: 'google', options: { redirectTo: window.location.origin }
        });
    },

    async logout() {
        await AppState.get().supabase.auth.signOut();
    }
};

const ProfileService = {
    async loadAvatar() {
        const { supabase, user } = AppState.get();
        if (!supabase || !user) return;

        const avatarUrl = user.user_metadata?.avatar_url;
        if (avatarUrl) {
            UI.elements.userAvatar.src = avatarUrl;
            return;
        }

        const { data } = supabase.storage.from('avatars').getPublicUrl(`${user.id}/avatar.png`);
        if (data?.publicUrl) {
            const res = await fetch(data.publicUrl, { method: 'HEAD' });
            if (res.ok) UI.elements.userAvatar.src = data.publicUrl;
        }
    },

    async uploadAvatar(file) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !file) return;

        UI.updateChatStatus('사진 업로드 중...', '#fbbf24');
        const fileName = `avatar.png`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(filePath, file, { upsert: true });

        if (uploadError) {
            alert("업로드 실패: " + uploadError.message);
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
        
        const { error: updateError } = await supabase.auth.updateUser({
            data: { avatar_url: `${publicUrl}?t=${Date.now()}` }
        });

        if (updateError) console.error("메타데이터 업데이트 실패:", updateError);
        
        UI.elements.userAvatar.src = `${publicUrl}?t=${Date.now()}`;
        UI.updateChatStatus('업로드 완료', '#4ade80');
        setTimeout(() => ChatService.updateStatusByRealtime(), 2000);
    }
};

const ChatService = {
    channel: null,
    pollingTimer: null,
    lastMessageId: 0,

    async init() {
        const { supabase, user } = AppState.get();
        if (!supabase || !user) return;

        await this.fetchInitialMessages(supabase, user);
        this.subscribeRealtime(supabase, user);
        this.startPolling(supabase, user);
    },

    async fetchInitialMessages(supabase, user) {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: true })
            .limit(50);

        if (error) {
            console.error("메시지 가져오기 오류:", error);
            return;
        }
        if (data && data.length > 0) {
            this.clearChat();
            data.forEach(msg => UI.renderChatMessage(msg, msg.user_email === user.email));
            this.lastMessageId = data[data.length - 1].id;
        }
    },

    subscribeRealtime(supabase, user) {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
        UI.updateChatStatus('연결 중...', '#fbbf24');

        this.channel = supabase
            .channel('chat_room_v1')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'messages' },
                (payload) => {
                    const newMsg = payload.new;
                    if (newMsg.id > this.lastMessageId) {
                        this.lastMessageId = newMsg.id;
                        const isMe = newMsg.user_email === user.email;
                        UI.renderChatMessage(newMsg, isMe);
                        
                        if (!isMe) NotificationService.playSound();
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    UI.updateChatStatus('실시간 연결됨 ●', '#4ade80');
                    this.stopPolling();
                } else if (status === 'CHANNEL_ERROR') {
                    UI.updateChatStatus('자동 업데이트 중 ●', '#a78bfa');
                }
            });
    },

    updateStatusByRealtime() {
        if (this.channel && this.channel.state === 'joined') {
            UI.updateChatStatus('실시간 연결됨 ●', '#4ade80');
        } else {
            UI.updateChatStatus('자동 업데이트 중 ●', '#a78bfa');
        }
    },

    startPolling(supabase, user) {
        this.stopPolling();
        this.pollingTimer = setInterval(async () => {
            const { data } = await supabase
                .from('messages')
                .select('*')
                .gt('id', this.lastMessageId)
                .order('created_at', { ascending: true });

            if (data && data.length > 0) {
                data.forEach(msg => UI.renderChatMessage(msg, msg.user_email === user.email));
                this.lastMessageId = data[data.length - 1].id;
            }
        }, 3000);
    },

    stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
    },

    async sendMessage(content) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !content.trim()) return;

        const { error } = await supabase.from('messages').insert([{
            content: content.trim(),
            user_email: user.email,
            user_id: user.id,
            avatar_url: user.user_metadata?.avatar_url || null
        }]);

        if (error) {
            console.error("메시지 전송 실패:", error);
            alert("메시지 전송에 실패했습니다.");
        } else {
            UI.elements.chatInput.value = '';
        }
    },

    async uploadAndSendImage(file) {
        const { supabase, user } = AppState.get();
        if (!supabase || !user || !file) return;

        UI.updateChatStatus('이미지 전송 중...', '#fbbf24');
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('chat-images')
            .upload(filePath, file);

        if (uploadError) {
            alert("이미지 업로드 실패: " + uploadError.message);
            UI.updateChatStatus('전송 실패', '#ef4444');
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('chat-images').getPublicUrl(filePath);
        await this.sendMessage(`![image](${publicUrl})`);
        UI.updateChatStatus('전송 완료', '#4ade80');
        setTimeout(() => this.updateStatusByRealtime(), 2000);
    },

    clearChat() {
        UI.elements.chatBox.innerHTML = '';
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    AuthService.init();
    SpeechService.init();
    NotificationService.init();

    const listeners = [
        { id: 'signupBtn', event: 'click', fn: () => AuthService.signup(UI.elements.emailInput.value.trim(), UI.elements.passwordInput.value) },
        { id: 'loginBtn', event: 'click', fn: () => AuthService.login(UI.elements.emailInput.value.trim(), UI.elements.passwordInput.value) },
        { id: 'googleLoginBtn', event: 'click', fn: () => AuthService.googleLogin() },
        { id: 'logoutBtn', event: 'click', fn: () => AuthService.logout() },
        { id: 'sendChatBtn', event: 'click', fn: () => {
            const content = UI.elements.chatInput.value.trim();
            if (!content) return;
            ChatService.sendMessage(content);
        }},
        { id: 'chatInput', event: 'keypress', fn: (e) => {
            if (e.key === 'Enter') {
                UI.elements.sendChatBtn.click();
            }
        }},
        { id: 'avatarChangeBtn', event: 'click', fn: () => UI.elements.avatarInput.click() },
        { id: 'userAvatar', event: 'click', fn: () => UI.elements.avatarInput.click() },
        { id: 'avatarInput', event: 'change', fn: (e) => {
            const file = e.target.files[0];
            if (file) ProfileService.uploadAvatar(file);
        }},
        { id: 'chatImageBtn', event: 'click', fn: () => UI.elements.chatImageInput.click() },
        { id: 'chatImageInput', event: 'change', fn: (e) => {
            const file = e.target.files[0];
            if (file) ChatService.uploadAndSendImage(file);
        }},
        { id: 'voiceBtn', event: 'click', fn: () => SpeechService.toggle() }
    ];

    listeners.forEach(({ id, event, fn }) => {
        const el = UI.elements[id];
        if (el) el.addEventListener(event, fn);
    });
});
