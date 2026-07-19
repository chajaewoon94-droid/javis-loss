JAVIS LOSS V10 COMPLETE

완료 기능
1. V10 Voice Core
- Microsoft Hyunsu Multilingual Online (Natural) 자동 우선 선택
- 음성 설정 UI 제거
- 속도 1.00 / 톤 0.68 / 연속 대화 고정
- 부팅음과 호출 응답음
- 영화식 문장 간격
- “자비스” 호출 → “네, 차재운 대리님.” → 다음 명령 대기
- “자비스 오늘 로스 알려줘”처럼 한 문장 명령도 지원
- 최근 음성 대화 로그 표시

2. MARK X HUD
- ONLINE
- SYSTEM CHECK
- AI CORE
- NETWORK
- VOICE
- LOSS DATABASE
- 실제 브라우저 연결, 데이터, 로딩, 오류, 패널 상태에 따라 점등

3. AI 대화
- 원인/왜/분석/대응 명령 시 AI API 호출
- AI 대화 패널 자동 열림
- 응답을 음성으로 출력

4. 음성 화면 제어
- 대시보드
- 발생 내역
- AI 분석 화면
- 변상금
- 운영관리
- 설정
- 새로고침/갱신/동기화
- 오늘/최근 7일/최근 30일/이번 달/전체 기간
- FD/FL 현황

5. 영화형 흐름
- 자비스 호출어 대기
- 호출음
- “네, 차재운 대리님.”
- 연속 대화
- 작전 브리핑
- HUD 코어/파형/상태 표시

적용 방법
1. 실행 중인 서버 종료: Ctrl+C
2. 압축 안의 javis-loss/src 폴더를 현재 프로젝트 src 폴더에 덮어쓰기
3. 필요 시 package.json도 덮어쓰기
4. 실행:
   npm run dev

테스트
- 자비스
- 오늘 로스 알려줘
- 발생 내역 보여줘
- 데이터 갱신해줘
- 에프 엘 현황
- 왜 에프 엘이 늘었는지 분석해줘
- 대시보드로 이동
- 최근 7일 현황 알려줘

Git 저장
git add .
git commit -m "Complete JAVIS LOSS V10"
git push
