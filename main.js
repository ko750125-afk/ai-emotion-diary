import { createClient } from '@supabase/supabase-js';

// HTML Escape 유틸
function escapeHtml(unsafe) {
    return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                         .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', async () => {
    // DOM 요소 초기화
    const loginSection = document.getElementById('login-section');
    const appContent = document.getElementById('app-content');
    
    const emailInput = document.getElementById('email-input');
    const passwordInput = document.getElementById('password-input');
    const loginBtn = document.getElementById('login-btn');
    const signupBtn = document.getElementById('signup-btn');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authError = document.getElementById('auth-error');
    const loggedInUserText = document.getElementById('logged-in-user');

    const voiceBtn = document.getElementById('voice-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const diaryInput = document.getElementById('diary-input');
    const aiResponse = document.getElementById('ai-response');
    const voiceText = document.getElementById('voice-text');
    const historyContainer = document.getElementById('history-container');

    let supabase = null;
    let currentUser = null;
    let sessionToken = null;

    // 1. Supabase 초기화 (백엔드에서 URL 및 Key 가져오기)
    async function initSupabase() {
        try {
            const envRes = await fetch('/api/env');
            if (!envRes.ok) {
                const errorData = await envRes.json();
                throw new Error(errorData.error || "Failed to fetch environment variables");
            }
            const envData = await envRes.json();
            if (envData.supabaseUrl && envData.supabaseAnonKey) {
                supabase = createClient(envData.supabaseUrl, envData.supabaseAnonKey);
                
                // 인증 상태 변경 감지 리스너 등록
                supabase.auth.onAuthStateChange((event, session) => {
                    handleAuthStateChange(session);
                });

                // 초기 세션 확인
                const { data: { session } } = await supabase.auth.getSession();
                handleAuthStateChange(session);
                
                authError.style.display = 'none';
                console.log("Supabase 초기화 성공");
            } else {
                throw new Error("Missing Supabase configuration values.");
            }
        } catch (e) {
            console.error("Supabase 초기화 실패:", e);
            showAuthError("서버 설정을 불러올 수 없어 로그인이 불가합니다. 관리자에게 문의하거나 잠시 후 다시 시도해주세요.");
        }
    }

    function handleAuthStateChange(session) {
        if (session) {
            currentUser = session.user;
            sessionToken = session.access_token;
            loggedInUserText.textContent = currentUser.email;
            
            // UI 변경
            loginSection.style.display = 'none';
            appContent.style.display = 'block';

            // 저장된 임시 일기 복구 및 히스토리 최신화
            restoreTempDiary();
            fetchAndRenderHistory();
        } else {
            currentUser = null;
            sessionToken = null;
            
            // UI 변경
            loginSection.style.display = 'flex';
            appContent.style.display = 'none';
        }
    }

    initSupabase();

    // --- 인증 이벤트 핸들러 ---
    function showAuthError(message) {
        authError.textContent = message;
        authError.style.display = 'block';
    }

    signupBtn.addEventListener('click', async () => {
        if (!supabase) return showAuthError("서버 설정이 완료되지 않아 회원가입을 진행할 수 없습니다.");
        authError.style.display = 'none';
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) return showAuthError("이메일과 비밀번호를 입력해주세요.");

        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            showAuthError(error.message);
        } else {
            alert("가입 확인 이메일을 확인해주세요!");
        }
    });

    loginBtn.addEventListener('click', async () => {
        if (!supabase) return showAuthError("서버 설정이 완료되지 않아 로그인을 진행할 수 없습니다.");
        authError.style.display = 'none';
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        if (!email || !password) return showAuthError("이메일과 비밀번호를 입력해주세요.");

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            showAuthError(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 틀렸습니다.' : error.message);
        }
    });

    googleLoginBtn.addEventListener('click', async () => {
        if (!supabase) return showAuthError("서버 설정이 완료되지 않아 로그인을 진행할 수 없습니다.");
        authError.style.display = 'none';
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        if (error) showAuthError(error.message);
    });

    logoutBtn.addEventListener('click', async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    });

    // --- 일기장 및 음성 인식 로직 ---
    function restoreTempDiary() {
        const savedDiary = localStorage.getItem('emotionDiary_text');
        const savedAIResponse = localStorage.getItem('emotionDiary_aiResponse');
        if (savedDiary) diaryInput.value = savedDiary;
        if (savedAIResponse) {
            aiResponse.innerText = savedAIResponse;
            aiResponse.style.whiteSpace = 'pre-wrap';
            aiResponse.style.color = 'var(--text-primary)';
        }
    }

    // Web Speech API 설정
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    let isRecording = false;
    let finalTranscript = '';
    let initialText = '';

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'ko-KR';
        recognition.interimResults = true;
        recognition.continuous = false; 

        recognition.onstart = () => {
            isRecording = true;
            voiceText.innerText = '음성 인식 중...';
            voiceBtn.classList.add('recording');
            initialText = diaryInput.value;
            if (initialText && !initialText.endsWith(' ') && !initialText.endsWith('\n')) {
                initialText += ' ';
            }
            finalTranscript = '';
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let newlyFinal = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                let transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) newlyFinal += transcript + ' ';
                else interimTranscript += transcript;
            }
            finalTranscript += newlyFinal;
            diaryInput.value = initialText + finalTranscript + interimTranscript;
        };

        recognition.onerror = (event) => {
            console.error('음성 인식 에러:', event.error);
            isRecording = false;
            voiceText.innerText = '음성으로 입력하기';
            voiceBtn.classList.remove('recording');
        };

        recognition.onend = () => {
            isRecording = false;
            voiceText.innerText = '음성으로 입력하기';
            voiceBtn.classList.remove('recording');
        };
    }

    voiceBtn.addEventListener('click', async () => {
        if (!SpeechRecognition) return alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
        if (isRecording) {
            recognition.stop();
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop());
                recognition.start(); 
            } catch (e) {
                console.error("마이크 활성화 에러:", e);
                alert('마이크 접근 권한을 허용해주세요.');
            }
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        if (!sessionToken) return alert('세션이 만료되었습니다. 다시 로그인해주세요.');

        const text = diaryInput.value.trim();
        if (!text) {
            alert('일기 내용을 먼저 작성해주세요.');
            diaryInput.focus();
            return;
        }

        aiResponse.style.color = 'var(--text-primary)';
        aiResponse.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="var(--primary-color)" stroke-width="5" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"></circle>
                </svg> 
                작성하신 일기를 바탕으로 감정을 분석하고 있습니다...
            </div>`;

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionToken}` // 서버에 사용자 인증 증명 넘김
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`${errorData}`);
            }

            const data = await response.json();
            const resultText = data.result;
            
            aiResponse.innerText = resultText;
            aiResponse.style.whiteSpace = 'pre-wrap';

            localStorage.setItem('emotionDiary_text', text);
            localStorage.setItem('emotionDiary_aiResponse', resultText);
            
            fetchAndRenderHistory();
        } catch (error) {
            console.error('API 호출 에러:', error);
            aiResponse.innerHTML = `<span style="color: #ef4444;"><b>분석 중 오류가 발생했습니다.</b><br><br>${error.message}</span>`;
        }
    });

    async function fetchAndRenderHistory() {
        if (!historyContainer || !sessionToken) return;

        historyContainer.innerHTML = '<div style="color: var(--text-secondary); padding: 20px 0;">히스토리를 불러오는 중입니다...</div>';

        try {
            const res = await fetch('/api/history', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}` // 서버로 본인의 히스토리만 요청
                }
            });

            if (!res.ok) throw new Error('히스토리 로드 실패');
            
            const data = await res.json();
            const histories = data.data || [];

            if (histories.length === 0) {
                historyContainer.innerHTML = '<div style="color: var(--text-secondary); padding: 20px 0;">아직 저장된 일기 히스토리가 없습니다. 첫 번째 일기를 기록해보세요!</div>';
                return;
            }

            historyContainer.innerHTML = '';
            
            histories.forEach(item => {
                const dateObj = new Date(item.timestamp);
                const dateStr = dateObj.toLocaleString('ko-KR', {
                    year: 'numeric', month: 'long', day: 'numeric', 
                    hour: '2-digit', minute: '2-digit'
                });

                const card = document.createElement('div');
                card.className = 'history-card';
                card.innerHTML = `
                    <div class="history-date">${dateStr}</div>
                    <div class="history-content">${escapeHtml(item.originalText)}</div>
                    <div class="history-ai">${escapeHtml(item.aiResponse)}</div>
                `;
                historyContainer.appendChild(card);
            });
        } catch (e) {
            console.error(e);
            historyContainer.innerHTML = '<div style="color: #ef4444; padding: 20px 0;">히스토리를 불러오는 중 오류가 발생했습니다.</div>';
        }
    }
});
