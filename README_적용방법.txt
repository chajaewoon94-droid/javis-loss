JAVIS LOSS 전체 수정본

1. 압축 안의 파일을 기존 C:\Users\USER\02_VSCode_웹사이트 폴더에 덮어쓰기
2. 터미널:
   npm install
   npm run dev
3. http://localhost:5173 접속
4. 왼쪽 '설정' → Apps Script 웹앱 URL 입력 → 저장 후 다시 연결
   URL 형식: https://script.google.com/macros/s/배포ID/exec
5. 확인 후 Ctrl+C
6. vercel --prod

화면모드:
- PC모드: 사이드바 고정, KPI 4열, 넓은 화면
- 모바일모드: 참고 HTML과 같은 최대 760px 확대형, KPI 2열, 차트 1열, 표 카드형

주의:
'Apps Script 웹앱 URL을 먼저 설정하세요.'는 오류가 아니라 아직 API 주소가 저장되지 않았다는 뜻입니다.
설정 메뉴에서 실제 Apps Script 웹앱 /exec 주소를 한 번 저장해야 데이터가 표시됩니다.
