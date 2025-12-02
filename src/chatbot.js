import { Chart, registerables } from 'chart.js';

// Chart.js 등록
Chart.register(...registerables);

// 순서쌍 표시를 위한 커스텀 플러그인 (마우스 호버 시에만 표시)
let hoveredPointIndex = -1;

const orderedPairPlugin = {
  id: 'orderedPairPlugin',
  
  // 마우스 이벤트 처리
  afterEvent(chart, args) {
    if (!args.event) return;
    
    const chartType = chart.config.type;
    if (chartType === 'pie' || chartType === 'doughnut') {
      if (hoveredPointIndex !== -1) {
        hoveredPointIndex = -1;
        chart.draw();
      }
      return;
    }
    
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || meta.data.length === 0) {
      if (hoveredPointIndex !== -1) {
        hoveredPointIndex = -1;
        chart.draw();
      }
      return;
    }
    
    const event = args.event;
    const eventType = event.type;
    
    // 마우스가 차트 영역 밖으로 나간 경우
    if (eventType === 'mouseout') {
      if (hoveredPointIndex !== -1) {
        hoveredPointIndex = -1;
        chart.draw();
      }
      return;
    }
    
    // mousemove 이벤트에서만 처리
    if (eventType !== 'mousemove') return;
    
    try {
      const canvasPosition = Chart.helpers.getRelativePosition(event, chart);
      
      // 가장 가까운 데이터 포인트 찾기
      let minDistance = Infinity;
      let closestIndex = -1;
      const hitRadius = 15; // 마우스 포인터 반경
      
      meta.data.forEach((point, index) => {
        if (point && typeof point.x === 'number' && typeof point.y === 'number') {
          const distance = Math.sqrt(
            Math.pow(point.x - canvasPosition.x, 2) + 
            Math.pow(point.y - canvasPosition.y, 2)
          );
          
          if (distance < hitRadius && distance < minDistance) {
            minDistance = distance;
            closestIndex = index;
          }
        }
      });
      
      // 호버된 포인트 인덱스 업데이트
      if (closestIndex !== hoveredPointIndex) {
        hoveredPointIndex = closestIndex;
        chart.draw(); // 차트 다시 그리기
      } else if (closestIndex === -1 && hoveredPointIndex !== -1) {
        // 마우스가 포인트에서 벗어난 경우
        hoveredPointIndex = -1;
        chart.draw();
      }
    } catch (error) {
      // 에러 발생 시 무시
      console.debug('Chart hover event error:', error);
    }
  },
  
  // 호버된 포인트 위에만 순서쌍 그리기
  afterDatasetsDraw(chart) {
    // 파이 차트가 아닐 때만 표시
    if (chart.config.type === 'pie' || chart.config.type === 'doughnut') {
      return;
    }
    
    // 호버된 포인트가 없으면 표시하지 않음
    if (hoveredPointIndex === -1) {
      return;
    }
    
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    
    if (!meta || !meta.data || !meta.data[hoveredPointIndex]) return;
    
    const point = meta.data[hoveredPointIndex];
    const dataset = chart.data.datasets[0];
    const labels = chart.data.labels;
    const values = dataset.data;
    
    if (labels && labels[hoveredPointIndex] !== undefined && values[hoveredPointIndex] !== undefined) {
      const xLabel = labels[hoveredPointIndex];
      const yValue = values[hoveredPointIndex];
      const orderedPair = `(${xLabel}, ${yValue})`;
      
      ctx.save();
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#667eea';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      
      const x = point.x;
      // 점 위에 표시하기 위해 (bar 차트는 막대 위에)
      const yOffset = chart.config.type === 'bar' ? -5 : -10;
      const y = point.y + yOffset;
      
      // 배경 박스 그리기
      const textMetrics = ctx.measureText(orderedPair);
      const textWidth = textMetrics.width;
      const textHeight = 14;
      const padding = 5;
      
      // 반투명 흰색 배경
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.strokeStyle = '#667eea';
      ctx.lineWidth = 1;
      
      // 둥근 모서리 사각형 그리기
      const rectX = x - textWidth / 2 - padding;
      const rectY = y - textHeight - padding;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = textHeight + padding * 2;
      const radius = 4;
      
      ctx.beginPath();
      ctx.moveTo(rectX + radius, rectY);
      ctx.lineTo(rectX + rectWidth - radius, rectY);
      ctx.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + radius);
      ctx.lineTo(rectX + rectWidth, rectY + rectHeight - radius);
      ctx.quadraticCurveTo(rectX + rectWidth, rectY + rectHeight, rectX + rectWidth - radius, rectY + rectHeight);
      ctx.lineTo(rectX + radius, rectY + rectHeight);
      ctx.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - radius);
      ctx.lineTo(rectX, rectY + radius);
      ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // 텍스트 그리기
      ctx.fillStyle = '#667eea';
      ctx.fillText(orderedPair, x, y);
      
      ctx.restore();
    }
  }
};

// 플러그인 등록
Chart.register(orderedPairPlugin);

// 환경 변수에서 API 키 가져오기
// Vite에서는 클라이언트에서 접근하려면 반드시 VITE_ 접두사가 필요합니다
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// API 키 확인 및 로깅
if (API_KEY && API_KEY !== 'your_api_key_here' && API_KEY.length > 0) {
  console.log('✅ OpenAI API 키가 성공적으로 로드되었습니다.');
} else {
  console.error('❌ VITE_OPENAI_API_KEY가 .env 파일에 설정되지 않았습니다.');
  console.error('📝 .env 파일에 다음을 추가하세요:');
  console.error('   VITE_OPENAI_API_KEY=sk-your-actual-api-key-here');
  console.error('');
  console.error('⚠️ 참고: Vite에서는 클라이언트에서 접근하려면 반드시 VITE_ 접두사가 필요합니다.');
  console.error('   OPENAI_API_KEY (접두사 없음)는 서버 사이드에서만 접근 가능합니다.');
}

// DOM 요소
const step0 = document.getElementById('step0');
const step1 = document.getElementById('step1');
// step2는 가운데 섹션에 있으므로 필요할 때 찾음
const topicInput = document.getElementById('topic');
const xVariableInput = document.getElementById('xVariable');
const xUnitInput = document.getElementById('xUnit');
const yVariableInput = document.getElementById('yVariable');
const yUnitInput = document.getElementById('yUnit');
const nextToStep1Btn = document.getElementById('nextToStep1');
const backToStep0Btn = document.getElementById('backToStep0');
const nextToStep2Btn = document.getElementById('nextToStep2');
const backToStep1Btn = document.getElementById('backToStep1');
const generateChartBtn = document.getElementById('generateChart');
const chartCanvas = document.getElementById('chartCanvas');
const chartAnalysis = document.getElementById('chartAnalysis');
const resetAnalysisBtn = document.getElementById('resetAnalysisBtn');

let hot = null;
let currentChart = null;
let currentData = {
  topic: '',
  xVariable: '',
  xUnit: '',
  yVariable: '',
  yUnit: '',
  data: []
};

// 대화형 분석 상태
let conversationState = {
  messages: [],
  questionCount: 0,
  isActive: false
};

// Handsontable 초기화
function initHandsontable() {
  const container = document.getElementById('dataTable');
  
  hot = new Handsontable(container, {
    data: [['', '']],
    colHeaders: ['X축 값', 'Y축 값'],
    rowHeaders: true,
    minSpareRows: 1,
    minSpareCols: 0,
    contextMenu: true,
    manualColumnResize: true,
    manualRowResize: true,
    stretchH: 'all',
    height: 350,
    licenseKey: 'non-commercial-and-evaluation',
    cells: function(row, col) {
      const cellProperties = {};
      if (col === 1) {
        cellProperties.type = 'numeric';
        cellProperties.format = '0[.]00';
      }
      return cellProperties;
    },
    afterChange: function(changes, source) {
      if (source !== 'loadData') {
        updateDataFromTable();
      }
    }
  });
}

// 테이블에서 데이터 업데이트
function updateDataFromTable() {
  const data = hot.getData();
  currentData.data = data
    .filter(row => row[0] && row[1] !== null && row[1] !== undefined && row[1] !== '')
    .map(row => ({
      label: String(row[0]),
      value: parseFloat(row[1]) || 0
    }));
}

// 0단계에서 1단계로 이동
nextToStep1Btn.addEventListener('click', () => {
  const topic = topicInput.value.trim();
  
  if (!topic) {
    alert('그래프 주제를 입력해주세요.');
    return;
  }
  
  // 데이터 저장
  currentData.topic = topic;
  
  // 단계 전환
  step0.classList.remove('active');
  step0.classList.add('completed');
  step1.classList.remove('inactive');
  step1.classList.add('active');
  
  // 스크롤
  step1.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// 1단계에서 0단계로 돌아가기
backToStep0Btn.addEventListener('click', () => {
  step1.classList.remove('active');
  step1.classList.add('inactive');
  step0.classList.remove('completed');
  step0.classList.add('active');
  step0.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// 1단계에서 2단계로 이동
nextToStep2Btn.addEventListener('click', () => {
  const xVar = xVariableInput.value.trim();
  const yVar = yVariableInput.value.trim();
  
  if (!xVar || !yVar) {
    alert('X축 변수명과 Y축 변수명을 모두 입력해주세요.');
    return;
  }
  
  // 데이터 저장
  currentData.xVariable = xVar;
  currentData.xUnit = xUnitInput.value.trim();
  currentData.yVariable = yVar;
  currentData.yUnit = yUnitInput.value.trim();
  
  // Handsontable 헤더 업데이트
  if (!hot) {
    initHandsontable();
  }
  
  const xHeader = xVar + (currentData.xUnit ? ` (${currentData.xUnit})` : '');
  const yHeader = yVar + (currentData.yUnit ? ` (${currentData.yUnit})` : '');
  hot.updateSettings({
    colHeaders: [xHeader, yHeader]
  });
  
  // 단계 전환
  step1.classList.remove('active');
  step1.classList.add('completed');
  const step2Element = document.getElementById('step2');
  if (step2Element) {
    step2Element.classList.remove('inactive');
    step2Element.classList.add('active');
    // 가운데 섹션으로 스크롤
    step2Element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});

// 2단계에서 1단계로 돌아가기
backToStep1Btn.addEventListener('click', () => {
  const step2Element = document.getElementById('step2');
  if (step2Element) {
    step2Element.classList.remove('active');
    step2Element.classList.add('inactive');
  }
  step1.classList.remove('completed');
  step1.classList.add('active');
  step1.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// 그래프 생성 및 분석 시작
generateChartBtn.addEventListener('click', async () => {
  updateDataFromTable();
  
  if (currentData.data.length === 0) {
    alert('데이터를 입력해주세요.');
    return;
  }
  
  generateChartBtn.disabled = true;
  generateChartBtn.innerHTML = '<span class="loading"></span> 그래프 생성 중...';
  
  try {
    // 먼저 그래프 그리기
    const labels = currentData.data.map(d => d.label);
    const values = currentData.data.map(d => d.value);
    
    drawChart({
      labels: labels,
      values: values,
      type: 'line'
    }, 'line');
    
    // 대화형 분석 시작
    startConversation();
    
    // 성공 시 버튼 텍스트 변경 (비활성화 상태 유지)
    generateChartBtn.innerHTML = '✅ 그래프 생성 완료';
    
    // 새로 분석하기 버튼 표시
    if (resetAnalysisBtn) {
      resetAnalysisBtn.style.display = 'block';
    }
    
  } catch (error) {
    console.error('오류:', error);
    chartAnalysis.innerHTML = `
      <h3>📈 그래프 해석</h3>
      <div class="error">오류가 발생했습니다: ${error.message}</div>
    `;
    // 오류 발생 시에만 버튼 다시 활성화
    generateChartBtn.disabled = false;
    generateChartBtn.innerHTML = '그래프 생성 및 분석';
  }
  // 성공 시 버튼은 비활성화 상태로 유지 (finally 블록 제거)
});

// 대화형 분석 시작
async function startConversation() {
  conversationState = {
    messages: [],
    questionCount: 0,
    isActive: true
  };
  
  // 기존 대화 내용 초기화
  chartAnalysis.innerHTML = `<h3>📈 그래프 해석 - ${currentData.topic}</h3>`;
  
  // 첫 번째 질문 표시 (주제 반영)
  const firstQuestion = `이 그래프는 "${currentData.topic}"에 대한 것입니다. 그래프를 보고 어떤 해석을 할 수 있나요?`;
  conversationState.messages.push({ role: 'teacher', type: 'question', questionNumber: 1, content: firstQuestion });
  
  // 전체 대화를 올바른 순서로 렌더링
  renderAllConversations();
  
  // 입력 UI 표시
  showConversationInput();
}

// 대화 메시지 추가
function addConversationMessage(role, content) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `conversation-message ${role}`;
  
  const roleLabel = role === 'teacher' ? '👨‍🏫 선생님' : '👨‍🎓 학생';
  messageDiv.innerHTML = `<strong>${roleLabel}:</strong> ${content.replace(/\n/g, '<br>')}`;
  
  const conversationContainer = document.querySelector('.conversation-container');
  if (!conversationContainer) {
    const container = document.createElement('div');
    container.className = 'conversation-container';
    chartAnalysis.appendChild(container);
    container.appendChild(messageDiv);
  } else {
    conversationContainer.appendChild(messageDiv);
  }
  
  // 스크롤
  chartAnalysis.scrollTop = chartAnalysis.scrollHeight;
}

// 전체 대화를 올바른 순서로 다시 렌더링
function renderAllConversations() {
  let conversationContainer = document.querySelector('.conversation-container');
  
  // 컨테이너가 없으면 생성
  if (!conversationContainer) {
    conversationContainer = document.createElement('div');
    conversationContainer.className = 'conversation-container';
    chartAnalysis.appendChild(conversationContainer);
  }
  
  // 기존 메시지 모두 제거 (입력 영역과 저장 버튼은 제외)
  const inputArea = document.querySelector('.conversation-input-area');
  const saveBtn = document.getElementById('saveResultBtn');
  const saveBtnWasVisible = saveBtn && saveBtn.style.display !== 'none';
  conversationContainer.innerHTML = '';
  
  // conversationState.messages를 순서대로 렌더링
  conversationState.messages.forEach(msg => {
    const messageDiv = document.createElement('div');
    
    if (msg.type === 'analysis') {
      // 분석 메시지
      messageDiv.className = 'conversation-message analysis';
      messageDiv.innerHTML = `<strong>📊 분석:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    } else if (msg.type === 'guidance') {
      // 글쓰기 유도 메시지
      messageDiv.className = 'conversation-message teacher';
      messageDiv.innerHTML = `<strong>👨‍🏫 선생님:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    } else if (msg.type === 'completion') {
      // 완료 메시지
      messageDiv.className = 'conversation-message teacher';
      messageDiv.innerHTML = `<strong>👨‍🏫 선생님:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    } else if (msg.type === 'writing') {
      // 학생이 작성한 글
      messageDiv.className = 'conversation-message writing';
      const typeLabel = msg.writingType ? `<span style="color: #667eea; font-weight: 600;">[${msg.writingType}]</span> ` : '';
      messageDiv.innerHTML = `<strong>👨‍🎓 학생 ${typeLabel}:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    } else if (msg.role === 'teacher') {
      // 선생님 질문
      messageDiv.className = 'conversation-message teacher';
      const questionLabel = msg.type === 'question' && msg.questionNumber 
        ? `<span style="color: #667eea; font-weight: 600;">[질문${msg.questionNumber}]</span> ` 
        : '';
      messageDiv.innerHTML = `<strong>👨‍🏫 선생님 ${questionLabel}:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    } else {
      // 학생 답변
      messageDiv.className = 'conversation-message student';
      messageDiv.innerHTML = `<strong>👨‍🎓 학생:</strong> ${msg.content.replace(/\n/g, '<br>')}`;
    }
    
    conversationContainer.appendChild(messageDiv);
  });
  
  // 입력 영역 다시 추가
  if (inputArea && conversationState.isActive) {
    conversationContainer.appendChild(inputArea);
  }
  
  // 글쓰기 입력 영역도 다시 추가
  const writingArea = document.querySelector('.writing-input-area');
  if (writingArea && writingArea.style.display !== 'none') {
    conversationContainer.appendChild(writingArea);
  }
  
  // 저장 버튼이 있었으면 다시 추가 (완료 메시지 다음에 표시)
  if (saveBtnWasVisible && saveBtn) {
    conversationContainer.appendChild(saveBtn);
    saveBtn.style.display = 'block';
  }
  
  // 스크롤
  chartAnalysis.scrollTop = chartAnalysis.scrollHeight;
}

// 대화 입력 UI 표시
function showConversationInput() {
  let inputArea = document.querySelector('.conversation-input-area');
  
  if (!inputArea) {
    inputArea = document.createElement('div');
    inputArea.className = 'conversation-input-area';
    
    const input = document.createElement('textarea');
    input.className = 'conversation-input';
    input.id = 'conversationInput';
    input.placeholder = '당신의 해석을 입력하세요...';
    input.rows = 3;
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'conversation-btn conversation-btn-primary';
    submitBtn.id = 'conversationSubmit';
    submitBtn.textContent = '답변하기';
    
    inputArea.appendChild(input);
    inputArea.appendChild(submitBtn);
    
    const conversationContainer = document.querySelector('.conversation-container') || chartAnalysis;
    conversationContainer.appendChild(inputArea);
    
    // 이벤트 리스너
    submitBtn.addEventListener('click', handleStudentResponse);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey === false && !submitBtn.disabled) {
        e.preventDefault();
        handleStudentResponse();
      }
    });
  }
  
  inputArea.style.display = 'flex';
  document.getElementById('conversationInput').focus();
}

// 학생 답변 처리
async function handleStudentResponse() {
  const input = document.getElementById('conversationInput');
  const submitBtn = document.getElementById('conversationSubmit');
  const studentAnswer = input.value.trim();
  
  if (!studentAnswer) {
    alert('답변을 입력해주세요.');
    return;
  }
  
  // 학생 답변을 메시지 배열에 추가 (순서 보장)
  conversationState.messages.push({ role: 'student', content: studentAnswer });
  conversationState.questionCount++;
  
  // 전체 대화를 올바른 순서로 다시 렌더링
  renderAllConversations();
  
  // 입력 비활성화
  input.value = '';
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="loading"></span> 분석 중...';
  
  try {
    // GPT API 호출 (분석과 다음 질문을 받음)
    const response = await callConversationAPI();
    
    // 응답을 분석과 질문으로 분리
    const { analysis, question } = parseTeacherResponse(response);
    
    // 분석 메시지 추가
    if (analysis) {
      conversationState.messages.push({ 
        role: 'teacher', 
        type: 'analysis', 
        content: analysis 
      });
    }
    
    // 5회 질문이 완료되었는지 확인
    const isLastRound = conversationState.questionCount >= 5;
    
    // 마지막 라운드가 아니면 다음 질문 추가
    if (!isLastRound && question) {
      const nextQuestionNumber = conversationState.questionCount + 1;
      conversationState.messages.push({ 
        role: 'teacher', 
        type: 'question', 
        questionNumber: nextQuestionNumber,
        content: question 
      });
    }
    
    // 전체 대화를 올바른 순서로 다시 렌더링
    renderAllConversations();
    
    // 질문 카운터 업데이트
    updateQuestionCounter();
    
    // 5회 완료 후 글쓰기 유도
    if (isLastRound) {
      hideConversationInput();
      showWritingGuidance();
      // PDF 저장 버튼은 글쓰기 완료 후에만 표시
    }
    
  } catch (error) {
    console.error('오류:', error);
    conversationState.messages.push({ role: 'teacher', content: `죄송합니다. 오류가 발생했습니다: ${error.message}` });
    renderAllConversations();
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '답변하기';
    input.focus();
  }
}

// 질문 카운터 업데이트
function updateQuestionCounter() {
  let counter = document.querySelector('.conversation-counter');
  if (!counter) {
    counter = document.createElement('div');
    counter.className = 'conversation-counter';
    const container = document.querySelector('.conversation-container');
    if (container) {
      container.insertBefore(counter, container.firstChild);
    }
  }
  counter.textContent = `질문 ${conversationState.questionCount}회차`;
}

// 대화 입력 UI 숨기기
function hideConversationInput() {
  const inputArea = document.querySelector('.conversation-input-area');
  if (inputArea) {
    inputArea.style.display = 'none';
  }
}

// 결과 저장 버튼 표시
function showSaveButton() {
  let saveBtn = document.getElementById('saveResultBtn');
  if (!saveBtn) {
    saveBtn = document.createElement('button');
    saveBtn.id = 'saveResultBtn';
    saveBtn.className = 'save-result-btn';
    saveBtn.textContent = 'PDF로 저장하기';
    saveBtn.addEventListener('click', saveResults);
    
    const conversationContainer = document.querySelector('.conversation-container') || chartAnalysis;
    conversationContainer.appendChild(saveBtn);
  }
  saveBtn.style.display = 'block';
}

// 글쓰기 유도 메시지 표시
function showWritingGuidance() {
  const guidanceMessage = {
    role: 'teacher',
    type: 'guidance',
    content: `훌륭합니다! 5회의 질문과 답변을 통해 그래프에 대해 깊이 있게 분석했습니다. 

이제 앞에서 한 분석을 근거로 다음과 같은 글을 작성해볼 수 있습니다:

📝 **비판하는 글**: 그래프에서 발견한 문제점이나 개선이 필요한 부분을 비판적으로 분석
💡 **제안하는 글**: 그래프를 바탕으로 개선 방안이나 새로운 접근 방법 제안
📖 **설명하는 글**: 그래프가 보여주는 현상이나 패턴을 체계적으로 설명

어떤 종류의 글을 작성하고 싶으신가요? 원하는 글의 종류를 선택하거나, 직접 작성해보세요.`
  };
  
  conversationState.messages.push(guidanceMessage);
  renderAllConversations();
  
  // 글쓰기 입력 영역 표시
  showWritingInput();
}

// 글쓰기 입력 영역 표시
function showWritingInput() {
  let writingArea = document.querySelector('.writing-input-area');
  
  if (!writingArea) {
    writingArea = document.createElement('div');
    writingArea.className = 'writing-input-area';
    
    const label = document.createElement('label');
    label.textContent = '글 종류 선택 또는 직접 작성:';
    label.style.display = 'block';
    label.style.marginBottom = '10px';
    label.style.fontWeight = '600';
    
    const select = document.createElement('select');
    select.className = 'writing-type-select';
    select.id = 'writingType';
    select.innerHTML = `
      <option value="">글 종류 선택 (선택사항)</option>
      <option value="critique">비판하는 글</option>
      <option value="proposal">제안하는 글</option>
      <option value="explanation">설명하는 글</option>
      <option value="custom">직접 작성</option>
    `;
    
    const textarea = document.createElement('textarea');
    textarea.className = 'conversation-input';
    textarea.id = 'writingInput';
    textarea.placeholder = '앞에서 한 분석을 근거로 글을 작성해보세요...';
    textarea.rows = 8;
    
    const submitBtn = document.createElement('button');
    submitBtn.className = 'conversation-btn conversation-btn-primary';
    submitBtn.id = 'writingSubmit';
    submitBtn.textContent = '글 작성 완료';
    
    writingArea.appendChild(label);
    writingArea.appendChild(select);
    writingArea.appendChild(textarea);
    writingArea.appendChild(submitBtn);
    
    const conversationContainer = document.querySelector('.conversation-container') || chartAnalysis;
    conversationContainer.appendChild(writingArea);
    
    // 이벤트 리스너
    submitBtn.addEventListener('click', handleWritingSubmit);
    select.addEventListener('change', (e) => {
      if (e.target.value && e.target.value !== 'custom') {
        const typeNames = {
          'critique': '비판하는 글',
          'proposal': '제안하는 글',
          'explanation': '설명하는 글'
        };
        textarea.placeholder = `${typeNames[e.target.value]}을 작성해보세요. 앞에서 한 분석을 근거로 작성하세요.`;
      } else {
        textarea.placeholder = '앞에서 한 분석을 근거로 글을 작성해보세요...';
      }
    });
  }
  
  writingArea.style.display = 'block';
  document.getElementById('writingInput').focus();
}

// 글 작성 완료 처리
function handleWritingSubmit() {
  const textarea = document.getElementById('writingInput');
  const select = document.getElementById('writingType');
  const submitBtn = document.getElementById('writingSubmit');
  const writing = textarea.value.trim();
  
  if (!writing) {
    alert('글을 입력해주세요.');
    return;
  }
  
  const writingType = select.value;
  const typeNames = {
    'critique': '비판하는 글',
    'proposal': '제안하는 글',
    'explanation': '설명하는 글',
    'custom': '작성한 글'
  };
  
  const typeLabel = typeNames[writingType] || '작성한 글';
  
  // 학생이 작성한 글 추가
  conversationState.messages.push({ 
    role: 'student', 
    type: 'writing',
    writingType: typeLabel,
    content: writing 
  });
  
  // 전체 대화를 올바른 순서로 다시 렌더링
  renderAllConversations();
  
  // 입력 영역 숨기기
  const writingArea = document.querySelector('.writing-input-area');
  if (writingArea) {
    writingArea.style.display = 'none';
  }
  
  // 완료 메시지
  conversationState.messages.push({
    role: 'teacher',
    type: 'completion',
    content: `좋은 글을 작성하셨습니다! "${typeLabel}"을 통해 그래프에 대한 깊이 있는 이해를 보여주셨네요. 결과를 저장하시겠어요?`
  });
  
  renderAllConversations();
  
  // 완료 메시지 다음에 PDF 저장 버튼 표시
  showSaveButton();
}

// 결과 저장 (PDF 다운로드)
async function saveResults() {
  // 저장 중 표시
  const saveBtn = document.getElementById('saveResultBtn');
  const originalText = saveBtn.textContent;
  saveBtn.disabled = true;
  saveBtn.textContent = 'PDF 생성 중...';
  
  try {
    // PDF 생성을 위한 HTML 컨테이너 생성
    const pdfContainer = document.createElement('div');
    pdfContainer.id = 'pdf-export-container';
    pdfContainer.style.position = 'fixed';
    pdfContainer.style.top = '-10000px'; // 화면 밖이지만 렌더링 가능
    pdfContainer.style.left = '0';
    pdfContainer.style.width = '210mm'; // A4 너비
    pdfContainer.style.minHeight = '297mm'; // A4 높이
    pdfContainer.style.padding = '20mm';
    pdfContainer.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    pdfContainer.style.backgroundColor = 'white';
    pdfContainer.style.color = '#333';
    pdfContainer.style.zIndex = '99999';
    pdfContainer.style.overflow = 'visible';
    pdfContainer.style.boxSizing = 'border-box';
    pdfContainer.style.display = 'block';
    pdfContainer.style.visibility = 'visible';
    
    // 제목
    const title = document.createElement('h1');
    title.textContent = '📊 그래프 분석 결과';
    title.style.textAlign = 'center';
    title.style.color = '#667eea';
    title.style.marginBottom = '10mm';
    pdfContainer.appendChild(title);
    
    // 0단계: 주제 입력
    const step0Section = document.createElement('div');
    step0Section.innerHTML = `
      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-after: avoid;">0단계: 주제 입력</h2>
      <p style="font-size: 1.2em; margin-bottom: 15mm;"><strong>${currentData.topic}</strong></p>
    `;
    pdfContainer.appendChild(step0Section);
    
    // 1단계: 변수와 단위 입력
    const step1Section = document.createElement('div');
    step1Section.innerHTML = `
      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-after: avoid;">1단계: 변수와 단위 입력</h2>
      <p style="margin-bottom: 5px;"><strong>X축 변수명:</strong> ${currentData.xVariable}</p>
      ${currentData.xUnit ? `<p style="margin-bottom: 5px;"><strong>X축 단위:</strong> ${currentData.xUnit}</p>` : ''}
      <p style="margin-bottom: 5px;"><strong>Y축 변수명:</strong> ${currentData.yVariable}</p>
      ${currentData.yUnit ? `<p style="margin-bottom: 15mm;"><strong>Y축 단위:</strong> ${currentData.yUnit}</p>` : '<p style="margin-bottom: 15mm;"></p>'}
    `;
    pdfContainer.appendChild(step1Section);
    
    // 2단계: 데이터 입력
    const step2Section = document.createElement('div');
    step2Section.innerHTML = `
      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-after: avoid;">2단계: 데이터 입력</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 15mm;">
        <thead>
          <tr style="background-color: #f0f4ff;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${currentData.xVariable}${currentData.xUnit ? ` (${currentData.xUnit})` : ''}</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${currentData.yVariable}${currentData.yUnit ? ` (${currentData.yUnit})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          ${currentData.data.map(d => `
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px;">${d.label}</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${d.value}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    pdfContainer.appendChild(step2Section);
    
    // 그래프 캡처를 위한 임시 컨테이너
    if (currentChart && chartCanvas) {
      // Canvas를 이미지로 변환
      const chartSection = document.createElement('div');
      chartSection.innerHTML = `
        <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-before: always; page-break-after: avoid;">3단계: 그래프</h2>
      `;
      pdfContainer.appendChild(chartSection);
      
      // Canvas를 이미지로 변환하여 추가
      const canvasImg = document.createElement('img');
      const chartDataUrl = chartCanvas.toDataURL('image/png', 1.0);
      
      // 이미지 로딩을 기다리는 Promise
      await new Promise((resolve, reject) => {
        canvasImg.onload = resolve;
        canvasImg.onerror = reject;
        canvasImg.src = chartDataUrl;
      });
      
      canvasImg.style.width = '100%';
      canvasImg.style.height = 'auto';
      canvasImg.style.maxWidth = '100%';
      canvasImg.style.display = 'block';
      canvasImg.style.marginBottom = '15mm';
      pdfContainer.appendChild(canvasImg);
    }
    
    // 4단계: 분석 대화
    const conversationSection = document.createElement('div');
    conversationSection.innerHTML = `
      <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-before: always; page-break-after: avoid;">4단계: 그래프 해석 (분석 대화)</h2>
    `;
    
    // 대화 메시지들을 HTML로 변환 (글쓰기 메시지는 제외 - 별도 섹션에서 표시)
    conversationState.messages.filter(msg => msg.type !== 'writing').forEach((msg, index) => {
      const messageDiv = document.createElement('div');
      messageDiv.style.marginBottom = '10px';
      messageDiv.style.padding = '10px';
      messageDiv.style.borderRadius = '5px';
      
      if (msg.type === 'analysis') {
        messageDiv.style.background = '#e8f5e9';
        messageDiv.style.borderLeft = '4px solid #4caf50';
        messageDiv.innerHTML = `<strong>📊 분석:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      } else if (msg.type === 'guidance') {
        messageDiv.style.background = '#f0f4ff';
        messageDiv.style.borderLeft = '4px solid #667eea';
        messageDiv.innerHTML = `<strong>👨‍🏫 선생님:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      } else if (msg.type === 'completion') {
        messageDiv.style.background = '#f0f4ff';
        messageDiv.style.borderLeft = '4px solid #667eea';
        messageDiv.innerHTML = `<strong>👨‍🏫 선생님:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      } else if (msg.type === 'writing') {
        messageDiv.style.background = '#fff9e6';
        messageDiv.style.borderLeft = '4px solid #ffc107';
        const typeLabel = msg.writingType ? `<span style="color: #667eea; font-weight: 600;">[${msg.writingType}]</span> ` : '';
        messageDiv.innerHTML = `<strong>👨‍🎓 학생 ${typeLabel}:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      } else if (msg.role === 'teacher') {
        messageDiv.style.background = '#f0f4ff';
        messageDiv.style.borderLeft = '4px solid #667eea';
        messageDiv.innerHTML = `<strong>👨‍🏫 선생님:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      } else {
        messageDiv.style.background = '#fff4e6';
        messageDiv.style.borderLeft = '4px solid #ff9800';
        messageDiv.innerHTML = `<strong>👨‍🎓 학생:</strong><br>${msg.content.replace(/\n/g, '<br>')}`;
      }
      
      conversationSection.appendChild(messageDiv);
    });
    
    pdfContainer.appendChild(conversationSection);
    
    // 5단계: 글쓰기 (글쓰기 메시지가 있는 경우)
    const writingMessages = conversationState.messages.filter(msg => msg.type === 'writing');
    if (writingMessages.length > 0) {
      const writingSection = document.createElement('div');
      writingSection.innerHTML = `
        <h2 style="color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 5px; margin-bottom: 10px; page-break-before: always; page-break-after: avoid;">5단계: 글쓰기</h2>
      `;
      
      writingMessages.forEach(msg => {
        const writingDiv = document.createElement('div');
        writingDiv.style.marginBottom = '15mm';
        writingDiv.style.padding = '15px';
        writingDiv.style.borderRadius = '5px';
        writingDiv.style.background = '#fff9e6';
        writingDiv.style.borderLeft = '4px solid #ffc107';
        
        const typeLabel = msg.writingType ? `<span style="color: #667eea; font-weight: 600; font-size: 1.1em;">[${msg.writingType}]</span><br><br>` : '';
        writingDiv.innerHTML = `
          <strong style="font-size: 1.1em;">👨‍🎓 학생 ${typeLabel}</strong>
          <div style="margin-top: 10px; line-height: 1.6; white-space: pre-wrap;">${msg.content.replace(/\n/g, '<br>')}</div>
        `;
        
        writingSection.appendChild(writingDiv);
      });
      
      pdfContainer.appendChild(writingSection);
    }
    
    // 날짜 추가
    const dateSection = document.createElement('div');
    dateSection.style.marginTop = '15mm';
    dateSection.style.textAlign = 'right';
    dateSection.style.color = '#666';
    dateSection.style.fontSize = '0.9em';
    dateSection.textContent = `생성일: ${new Date().toLocaleString('ko-KR')}`;
    pdfContainer.appendChild(dateSection);
    
    // DOM에 추가 (렌더링을 위해)
    document.body.appendChild(pdfContainer);
    
    // 컨테이너를 화면에 보이게 하여 렌더링 보장
    pdfContainer.style.top = '0';
    pdfContainer.style.left = '0';
    pdfContainer.style.width = '794px'; // A4 너비를 픽셀로 변환 (210mm = 794px at 96 DPI)
    pdfContainer.style.maxWidth = '794px';
    
    // 컨테이너가 렌더링될 시간을 충분히 주기
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 디버깅: 컨테이너 내용 확인
    const containerText = pdfContainer.textContent || pdfContainer.innerText || '';
    console.log('PDF 컨테이너 텍스트 길이:', containerText.length);
    console.log('PDF 컨테이너 자식 요소 수:', pdfContainer.children.length);
    
    if (containerText.length === 0) {
      console.warn('경고: PDF 컨테이너가 비어있습니다!');
      throw new Error('PDF 생성 실패: 컨테이너에 내용이 없습니다.');
    }
    
    // html2canvas와 jsPDF를 직접 사용하여 PDF 생성
    const html2canvasLib = window.html2canvas || (typeof html2canvas !== 'undefined' ? html2canvas : null);
    const jsPDFLib = window.jspdf?.jsPDF || window.jsPDF || (typeof jsPDF !== 'undefined' ? jsPDF : null);
    
    if (html2canvasLib && jsPDFLib) {
      // html2canvas와 jsPDF를 직접 사용
      try {
        console.log('html2canvas와 jsPDF를 사용하여 PDF 생성 중...');
        const canvas = await html2canvasLib(pdfContainer, {
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          width: pdfContainer.scrollWidth,
          height: pdfContainer.scrollHeight
        });
        
        console.log('Canvas 생성 완료:', canvas.width, 'x', canvas.height);
        
        const imgData = canvas.toDataURL('image/png', 1.0);
        const pdf = new jsPDFLib('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;
        
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        pdf.save(`그래프_분석_결과_${new Date().toISOString().split('T')[0]}.pdf`);
        console.log('PDF 저장 완료');
      } catch (pdfError) {
        console.error('PDF 생성 오류:', pdfError);
        throw pdfError;
      }
    } else {
      // html2pdf 라이브러리 사용 (폴백)
      const html2pdfLib = window.html2pdf || (typeof html2pdf !== 'undefined' ? html2pdf : null);
      
      if (html2pdfLib) {
        console.log('html2pdf 라이브러리를 사용하여 PDF 생성 중...');
        const opt = {
          margin: [0, 0, 0, 0],
          filename: `그래프_분석_결과_${new Date().toISOString().split('T')[0]}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true,
            logging: true,
            letterRendering: true,
            allowTaint: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0
          },
          jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'portrait',
            compress: true
          },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
        
        try {
          await html2pdfLib().set(opt).from(pdfContainer).save();
          console.log('PDF 저장 완료 (html2pdf)');
        } catch (pdfError) {
          console.error('PDF 생성 오류:', pdfError);
          throw pdfError;
        }
      } else {
        throw new Error('PDF 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해주세요.');
      }
    }
    
    // 컨테이너를 다시 화면 밖으로 이동
    pdfContainer.style.top = '-10000px';
    
    // 임시 컨테이너 제거
    await new Promise(resolve => setTimeout(resolve, 500));
    if (pdfContainer.parentNode) {
      document.body.removeChild(pdfContainer);
    }
    
    alert('PDF가 성공적으로 생성되었습니다!');
  } catch (error) {
    console.error('PDF 생성 오류:', error);
    alert(`PDF 생성 중 오류가 발생했습니다: ${error.message}`);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

// 선생님 응답을 분석과 질문으로 분리
function parseTeacherResponse(response) {
  // "분석:" 또는 "질문:" 구분자로 나누기 시도
  const analysisMatch = response.match(/분석[:\s]*([^질문]*?)(?=질문|$)/is);
  const questionMatch = response.match(/질문[:\s]*(.*?)$/is);
  
  let analysis = '';
  let question = '';
  
  if (analysisMatch && questionMatch) {
    // 구분자가 있는 경우
    analysis = analysisMatch[1].trim();
    question = questionMatch[1].trim();
  } else {
    // 구분자가 없는 경우, 문단으로 나누기
    const paragraphs = response.split(/\n\n+/);
    if (paragraphs.length >= 2) {
      // 마지막 문단을 질문으로, 나머지를 분석으로
      question = paragraphs[paragraphs.length - 1].trim();
      analysis = paragraphs.slice(0, -1).join('\n\n').trim();
    } else {
      // 하나의 응답인 경우, 전체를 분석으로 하고 질문 생성
      analysis = response.trim();
      question = '더 깊이 생각해볼 점이 있나요?';
    }
  }
  
  return { analysis, question };
}

// 대화형 GPT API 호출
async function callConversationAPI() {
  if (!API_KEY || API_KEY === 'your_api_key_here') {
    throw new Error('API 키가 설정되지 않았습니다. .env 파일에 VITE_OPENAI_API_KEY를 설정해주세요.');
  }

  // 데이터 정보
  const dataText = currentData.data
    .map(d => `${d.label}: ${d.value}`)
    .join(', ');
  
  // 대화 히스토리 구성
  const messages = [
    {
      role: 'system',
      content: `당신은 친절한 수학/과학 선생님입니다. 학생이 그래프를 보고 해석을 하고 있습니다. 

이 그래프의 주제는: "${currentData.topic}"입니다.

학생의 답변을 듣고 다음 두 가지를 제공해야 합니다:

1. **분석**: 학생의 답변에 대한 피드백
   - 학생의 해석이 맞다면 칭찬하고 좋은 점을 언급하세요
   - 학생의 해석에 오류가 있다면 친절하게 지적하고 올바른 방향을 제시하세요
   - 주제 "${currentData.topic}"와 관련된 설명을 추가하세요

2. **질문**: 다음 질문
   - 학생이 더 깊이 생각할 수 있도록 유도하는 질문
   - 주제에 대한 설명을 포함한 질문
   - 올바른 분석을 할 수 있도록 도와주는 질문

응답 형식:
분석: [학생 답변에 대한 분석과 피드백]
질문: [다음 질문]

변수 정보:
- X축: ${currentData.xVariable}${currentData.xUnit ? ` (단위: ${currentData.xUnit})` : ''}
- Y축: ${currentData.yVariable}${currentData.yUnit ? ` (단위: ${currentData.yUnit})` : ''}

데이터: ${dataText}

친절하고 격려하는 톤으로 대화하세요. 주제에 맞는 해석을 유도해주세요.`
    }
  ];
  
  // 대화 히스토리 추가 (분석 메시지는 제외하고 질문만)
  conversationState.messages.forEach(msg => {
    if (msg.role === 'student') {
      messages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'teacher' && msg.type === 'question') {
      // 질문만 히스토리에 추가
      messages.push({ role: 'assistant', content: msg.content });
    }
  });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API 오류: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    // 네트워크 오류 처리
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      throw new Error('네트워크 연결을 확인해주세요. API 키가 올바르게 설정되었는지 확인하세요.');
    }
    throw error;
  }
}

// 그래프 그리기
function drawChart(data, type = 'line') {
  // 기존 차트 제거
  if (currentChart) {
    currentChart.destroy();
  }

  const ctx = chartCanvas.getContext('2d');
  
  const chartType = type === 'pie' ? 'pie' : type === 'bar' ? 'bar' : 'line';
  
  const xLabel = currentData.xVariable + (currentData.xUnit ? ` (${currentData.xUnit})` : '');
  const yLabel = currentData.yVariable + (currentData.yUnit ? ` (${currentData.yUnit})` : '');
  
  const chartConfig = {
    type: chartType,
    data: {
      labels: data.labels || [],
      datasets: [{
        label: yLabel,
        data: data.values || [],
        backgroundColor: chartType === 'pie' 
          ? [
              'rgba(102, 126, 234, 0.8)',
              'rgba(118, 75, 162, 0.8)',
              'rgba(255, 99, 132, 0.8)',
              'rgba(54, 162, 235, 0.8)',
              'rgba(255, 206, 86, 0.8)',
              'rgba(75, 192, 192, 0.8)',
              'rgba(153, 102, 255, 0.8)',
              'rgba(255, 159, 64, 0.8)'
            ]
          : 'rgba(102, 126, 234, 0.2)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 2,
        fill: chartType === 'line' ? true : false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: `${currentData.yVariable} vs ${currentData.xVariable}`,
          font: {
            size: 18
          }
        }
      },
      scales: chartType !== 'pie' ? {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: yLabel
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          title: {
            display: true,
            text: xLabel
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      } : {}
    }
  };

  currentChart = new Chart(ctx, chartConfig);
  
  // 캔버스에 마우스 이벤트 리스너 추가 (마우스가 캔버스 밖으로 나갔을 때 처리)
  if (chartCanvas && currentChart) {
    const handleMouseLeave = () => {
      if (hoveredPointIndex !== -1) {
        hoveredPointIndex = -1;
        currentChart.draw();
      }
    };
    
    // 기존 이벤트 리스너 제거 후 새로 추가
    chartCanvas.removeEventListener('mouseleave', handleMouseLeave);
    chartCanvas.addEventListener('mouseleave', handleMouseLeave);
  }
}

// 전체 상태 리셋 함수
function resetAllAnalysis() {
  // 데이터 초기화
  currentData = {
    topic: '',
    xVariable: '',
    xUnit: '',
    yVariable: '',
    yUnit: '',
    data: []
  };
  
  // 대화 상태 초기화
  conversationState = {
    messages: [],
    questionCount: 0,
    isActive: false
  };
  
  // 입력 필드 초기화
  topicInput.value = '';
  xVariableInput.value = '';
  xUnitInput.value = '';
  yVariableInput.value = '';
  yUnitInput.value = '';
  
  // Handsontable 데이터 초기화
  if (hot) {
    hot.loadData([['', '']]);
    hot.updateSettings({
      colHeaders: ['X축 값', 'Y축 값']
    });
  }
  
  // 차트 초기화
  if (currentChart) {
    currentChart.destroy();
    currentChart = null;
  }
  drawChart({
    labels: ['데이터를 입력하세요'],
    values: [0],
    type: 'bar'
  }, 'bar');
  
  // 분석 영역 초기화
  chartAnalysis.innerHTML = `
    <h3>📈 그래프 해석</h3>
    <p>데이터를 입력하고 그래프를 생성하면 해석 대화가 시작됩니다.</p>
  `;
  
  // 단계 초기화 - step0 활성화
  step0.classList.remove('completed');
  step0.classList.add('active');
  step1.classList.remove('active', 'completed');
  step1.classList.add('inactive');
  
  const step2Element = document.getElementById('step2');
  if (step2Element) {
    step2Element.classList.remove('active');
    step2Element.classList.add('inactive');
  }
  
  // 그래프 생성 버튼 초기화
  generateChartBtn.disabled = false;
  generateChartBtn.innerHTML = '그래프 생성 및 분석';
  
  // 리셋 버튼 숨기기
  if (resetAnalysisBtn) {
    resetAnalysisBtn.style.display = 'none';
  }
  
  // 저장 버튼 제거
  const saveBtn = document.getElementById('saveResultBtn');
  if (saveBtn) {
    saveBtn.remove();
  }
  
  // 대화 입력 영역 제거
  const inputArea = document.querySelector('.conversation-input-area');
  if (inputArea) {
    inputArea.remove();
  }
  
  // 글쓰기 입력 영역 제거
  const writingArea = document.querySelector('.writing-input-area');
  if (writingArea) {
    writingArea.remove();
  }
  
  // step0으로 스크롤
  step0.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// 리셋 버튼 이벤트 리스너
if (resetAnalysisBtn) {
  resetAnalysisBtn.addEventListener('click', () => {
    if (confirm('정말로 새로 분석을 시작하시겠습니까? 현재 진행 중인 분석이 모두 초기화됩니다.')) {
      resetAllAnalysis();
    }
  });
}

// 초기 차트 (예시)
drawChart({
  labels: ['데이터를 입력하세요'],
  values: [0],
  type: 'bar'
}, 'bar');

// 페이지 로드 시 Handsontable 초기화
// DOM이 준비되면 Handsontable 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initHandsontableOnLoad);
} else {
  // DOM이 이미 로드된 경우
  initHandsontableOnLoad();
}

function initHandsontableOnLoad() {
  // Handsontable 초기화 (가운데 섹션이 항상 보이므로)
  const dataTableContainer = document.getElementById('dataTable');
  if (dataTableContainer && !hot) {
    // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 초기화
    setTimeout(() => {
      initHandsontable();
    }, 100);
  }
}
