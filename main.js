document.addEventListener('DOMContentLoaded', () => {
    const voiceBtn = document.getElementById('voice-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const diaryInput = document.getElementById('diary-input');
    const aiResponse = document.getElementById('ai-response');
    const voiceText = document.getElementById('voice-text');

    // 로컬 스토리지에서 저장된 일기 및 AI 답변 불러오기
    const savedDiary = localStorage.getItem('emotionDiary_text');
    const savedAIResponse = localStorage.getItem('emotionDiary_aiResponse');
    
    if (savedDiary) {
        diaryInput.value = savedDiary;
    }
    if (savedAIResponse) {
        aiResponse.innerText = savedAIResponse;
        aiResponse.style.whiteSpace = 'pre-wrap';
        aiResponse.style.color = 'var(--text-primary)';
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
        // PC 크롬 환경의 고질적인 버그(continuous=true 시 마이크 즉시 꺼짐 현상) 방지
        recognition.continuous = false; 

        recognition.onstart = () => {
            isRecording = true;
            voiceText.innerText = '음성 인식 중...';
            voiceBtn.classList.add('recording');
            
            initialText = diaryInput.value;
            // 기존 텍스트가 있으면 공백 하나 추가해서 자연스럽게 이어지게 함
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
                if (event.results[i].isFinal) {
                    newlyFinal += transcript + ' '; // 완전히 인식된 문장 뒤에 띄어쓰기
                } else {
                    interimTranscript += transcript; // 아직 인식 중인 문장
                }
            }

            finalTranscript += newlyFinal;
            diaryInput.value = initialText + finalTranscript + interimTranscript;
        };

        recognition.onerror = (event) => {
            console.error('음성 인식 에러 상세:', event.error);
            isRecording = false;
            voiceText.innerText = '음성으로 입력하기';
            voiceBtn.classList.remove('recording');

            if (event.error === 'not-allowed') {
                alert('마이크 사용 권한이 차단되었습니다. 주소창 왼쪽의 자물쇠 아이콘을 눌러 마이크 권한을 허용해주세요.');
            } else if (event.error === 'audio-capture') {
                alert('마이크를 찾을 수 없거나 연결되어 있지 않습니다. 물리적인 마이크 연결 상태나 윈도우 마이크 설정을 확인하세요.');
            } else if (event.error !== 'no-speech') {
                console.warn('예기치 않은 음성 인식 오류:', event.error);
            }
        };

        recognition.onend = () => {
            isRecording = false;
            voiceText.innerText = '음성으로 입력하기';
            voiceBtn.classList.remove('recording');
        };
    }

    // 음성 입력 버튼 클릭 이벤트
    voiceBtn.addEventListener('click', async () => {
        if (!SpeechRecognition) {
            alert('이 브라우저는 음성 인식을 지원하지 않습니다. 구글 크롬(Chrome)이나 엣지(Edge) 데스크톱 버전을 사용해주세요.');
            return;
        }

        if (isRecording) {
            recognition.stop();
            isRecording = false;
            voiceText.innerText = '음성으로 입력하기';
            voiceBtn.classList.remove('recording');
        } else {
            try {
                // Web Speech API가 조용히 죽는 현상을 방지하기 위해 강제로 마이크 스트림을 먼저 열어 엔진을 깨웁니다.
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

                // 정상적으로 열렸다면 잠든 스트림은 닫아주고 바로 인식 API로 넘깁니다.
                stream.getTracks().forEach(track => track.stop());

                isRecording = true;
                voiceText.innerText = '음성 인식 준비 중...';
                voiceBtn.classList.add('recording');

                recognition.start(); // 마이크 권한 요청 및 인식 시작
            } catch (e) {
                console.error("마이크 활성화 에러:", e);
                isRecording = false;
                voiceText.innerText = '음성으로 입력하기';
                voiceBtn.classList.remove('recording');

                if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
                    alert('마이크 사용 권한이 차단되어 있습니다. 주소창 왼쪽 자물쇠를 눌러 마이크 권한을 재설정해주세요.');
                } else if (e.name === 'NotFoundError') {
                    alert('컴퓨터에 연결된 마이크를 찾을 수 없습니다! 마이크 선이 제대로 꽂혀있는지 확인해주세요.');
                } else if (e.name === 'NotReadableError') {
                    alert('마이크를 사용할 수 없습니다. 다른 프로그램(줌, 디스코드 등)에서 마이크를 독점하고 있는지 확인하세요.');
                } else {
                    alert('마이크를 물리적으로 켤 수 없습니다: ' + e.message);
                }
            }
        }
    });

    // 분석 요청하기 버튼 클릭 이벤트
    analyzeBtn.addEventListener('click', async () => {
        const text = diaryInput.value.trim();
        
        if (!text) {
            alert('일기 내용을 먼저 작성해주세요.');
            diaryInput.focus();
            return;
        }

        // 로딩 UI 표시
        aiResponse.style.color = 'var(--text-primary)';
        aiResponse.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="var(--primary-color)" stroke-width="5" stroke-dasharray="31.4 31.4" stroke-dashoffset="0"></circle>
                </svg> 
                작성하신 일기를 바탕으로 감정을 분석하고 있습니다...
            </div>
        `;

        try {
            // 이제 프론트엔드에서는 프롬프트 조합이나 API 키를 신경 쓰지 않고, 
            // 오직 사용자가 작성한 '일기 텍스트'만 백엔드(/api/analyze)로 넘깁니다.
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ text })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`백엔드 서버 요청 실패 (Status: ${response.status})\n상세: ${errorData}`);
            }

            // 백엔드가 처리해서 넘겨준 최종 결과물(result)을 받습니다.
            const data = await response.json();
            const resultText = data.result;
            
            // 안전하게 텍스트 대입 및 줄바꿈 처리
            aiResponse.innerText = resultText;
            aiResponse.style.whiteSpace = 'pre-wrap';

            // 로컬 스토리지에 분석이 완료된 일기 및 답변 저장
            localStorage.setItem('emotionDiary_text', text);
            localStorage.setItem('emotionDiary_aiResponse', resultText);
        } catch (error) {
            console.error('API 호출 에러:', error);
            aiResponse.innerHTML = `<span style="color: #ef4444;"><b>분석 중 오류가 발생했습니다.</b><br><br><pre style="white-space: pre-wrap; font-size: 14px;">${error.message}</pre></span>`;
        }
    });
});
