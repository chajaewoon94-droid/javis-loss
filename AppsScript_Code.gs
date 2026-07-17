/***************************************************************
 * JAVIS LOSS DASHBOARD
 *
 * 기능
 * 1. PREV/CUR 최신 LOC재고현황 XLSX 불러오기
 * 2. CR/FD/FL 증가분 감지
 * 3. 불용재고_LOG 누적
 * 4. 시간대별/일별/월별 집계
 * 5. DASHBOARD 자동 생성
 * 6. OpenAI AI 분석
 *
 * CR : 고객사 품질 / 고객사 귀책 파손
 * FD : 센터 파손
 * FL : 센터 분실
 ***************************************************************/


/***************************************************************
 * 기본 설정
 ***************************************************************/

const BAD_STOCK_CONFIG_JWCHA = {
  TARGET_SS_ID: "1juakuNwQLa5dMnfxlFKIES57hCi1Mp0vwnJx59e_vY0",

  PREV_FOLDER_ID: "120_3hE44NDQ2PVkAc_v_OuHtav7fja82",
  CUR_FOLDER_ID: "1onboeJahFba3ka7VN13CGy_AZJBeLo_x",

  PREV_SHEET_NAME: "PREV",
  CUR_SHEET_NAME: "CUR",
  LOG_SHEET_NAME: "불용재고_LOG",
  HOURLY_SHEET_NAME: "시간대별_현황",
  DAILY_SHEET_NAME: "일별_현황",
  MONTHLY_SHEET_NAME: "월별_현황",
  DASHBOARD_SHEET_NAME: "DASHBOARD",
  AI_SHEET_NAME: "AI_분석",
  MANAGEMENT_SHEET_NAME: "LOSS_관리",

  OPENAI_MODEL: "gpt-5-mini",
  OPENAI_KEY_PROPERTY: "OPENAI_API_KEY_JWCHA",

  TIMEZONE: "Asia/Seoul"
};


/***************************************************************
 * 메뉴
 ***************************************************************/

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("불용재고 모니터링")
    .addItem("전체 실행", "runBadStockMonitoringJWCHA")
    .addSeparator()
    .addItem("PREV / CUR 업데이트", "updateCurAndPrevFromLatestFilesJWCHA")
    .addItem("발생내역 누적", "appendBadStockLogJWCHA")
    .addItem("기존 중복 LOG 정리", "cleanupDuplicateBadStockLogJWCHA")
    .addItem("현황 집계 갱신", "updateBadStockSummaryJWCHA")
    .addItem("대시보드 갱신", "buildBadStockDashboardJWCHA")
    .addSeparator()
    .addItem("네이버 API 키 저장", "setNaverShoppingApiKeysJWCHA")
    .addItem("신규 상품 최고가 조회", "syncNaverMaxPricesFromBadStockLogJWCHA")
    .addItem("전체 상품 가격 재조회", "refreshAllNaverMaxPricesJWCHA")
    .addSeparator()
    .addItem("OpenAI API 키 저장", "setOpenAiApiKeyJWCHA")
    .addItem("AI 분석 실행", "runBadStockAiAnalysisJWCHA")
    .addItem("OpenAI API 키 삭제", "deleteOpenAiApiKeyJWCHA")
    .addSeparator()
    .addItem("운영관리 시트 구성", "setupLossManagementSheetJWCHA")
    .addItem("이번 달 자동 보고문 생성", "createMonthlyLossReportJWCHA")
    .addSeparator()
    .addItem("최초 시트 구성", "setupBadStockMonitoringJWCHA")
    .addToUi();
}


/***************************************************************
 * 전체 실행
 ***************************************************************/

function runBadStockMonitoringJWCHA() {
  const lock = LockService.getScriptLock();

  const properties =
    PropertiesService.getScriptProperties();

  let appendResult = {
    totalNewCount: 0,
    centerLossNewCount: 0,
    centerLossNewQty: 0
  };

  try {
    lock.waitLock(30000);

    setupBadStockMonitoringJWCHA();
    updateCurAndPrevFromLatestFilesJWCHA();

    appendResult =
      appendBadStockLogJWCHA() || appendResult;

    updateBadStockSummaryJWCHA();
    buildBadStockDashboardJWCHA();

    /*
     * 수동 전체 실행 시간도 웹의 마지막 확인시간으로 저장
     */
    properties.setProperties({
      BAD_STOCK_LAST_AUTO_REFRESH_TIME:
        String(new Date().getTime()),

      BAD_STOCK_LAST_TRIGGER_STATUS:
        "SUCCESS",

      BAD_STOCK_LAST_REFRESH_TYPE:
        "MANUAL_FULL"
    });

    SpreadsheetApp.flush();

  } catch (error) {
    properties.setProperties({
      BAD_STOCK_LAST_TRIGGER_STATUS:
        "ERROR",

      BAD_STOCK_LAST_TRIGGER_ERROR:
        String(error.message || error),

      BAD_STOCK_LAST_TRIGGER_ERROR_TIME:
        String(new Date().getTime())
    });

    Logger.log(error.stack || error);

    throw new Error(
      "불용재고 모니터링 실행 오류\n" +
      error.message
    );

  } finally {
    lock.releaseLock();
  }

  /*
   * 메인 Lock 해제 후 네이버 가격 조회
   */
  try {
    syncNaverMaxPricesFromBadStockLogJWCHA();

  } catch (priceError) {
    Logger.log(
      "네이버 가격 조회 실패: " +
      priceError.message
    );
  }

  /*
   * 신규 FD/FL이 발생한 경우에만 AI 자동 분석
   */
  if (appendResult.centerLossNewCount > 0) {
    try {
      runBadStockAiAnalysisJWCHA();

      properties.setProperties({
        BAD_STOCK_LAST_AUTO_AI_TIME:
          String(new Date().getTime()),

        BAD_STOCK_LAST_AUTO_AI_STATUS:
          "SUCCESS"
      });

    } catch (aiError) {
      properties.setProperties({
        BAD_STOCK_LAST_AUTO_AI_STATUS:
          "ERROR",

        BAD_STOCK_LAST_AUTO_AI_ERROR:
          String(aiError.message || aiError)
      });

      Logger.log(
        "AI 자동 분석 실패: " +
        aiError.message
      );
    }
  }

  SpreadsheetApp.getActive().toast(
    "전체 갱신 완료 / 신규 센터 LOSS " +
    appendResult.centerLossNewCount +
    "건, " +
    appendResult.centerLossNewQty +
    "EA",
    "JAVIS LOSS",
    7
  );
}



/***************************************************************
 * 30분 자동 트리거 전용
 * 웹 대시보드에 필요한 데이터만 갱신
 ***************************************************************/

function runBadStockTriggerJWCHA() {
  const lock = LockService.getScriptLock();

  let appendResult = {
    totalNewCount: 0,
    centerLossNewCount: 0,
    centerLossNewQty: 0
  };

  const properties =
    PropertiesService.getScriptProperties();

  try {
    lock.waitLock(30000);

    /*
     * 1. 시트 확인
     * 2. PREV/CUR 최신 파일 적용
     * 3. 신규 불용재고 LOG 누적
     * 4. 시간대별/일별/월별 집계
     */
    setupBadStockMonitoringJWCHA();
    updateCurAndPrevFromLatestFilesJWCHA();

    appendResult =
      appendBadStockLogJWCHA() || appendResult;

    updateBadStockSummaryJWCHA();

    /*
     * 실제 자동 확인 시간 저장
     * 신규 LOSS가 없어도 매 실행마다 변경됨
     */
    properties.setProperties({
      BAD_STOCK_LAST_AUTO_REFRESH_TIME:
        String(new Date().getTime()),

      BAD_STOCK_LAST_TRIGGER_STATUS:
        "SUCCESS"
    });

    SpreadsheetApp.flush();

    Logger.log(
      "불용재고 자동 갱신 완료 / 신규 전체: " +
      appendResult.totalNewCount +
      "건 / 신규 센터 LOSS: " +
      appendResult.centerLossNewCount +
      "건 / " +
      appendResult.centerLossNewQty +
      "EA"
    );

  } catch (error) {
    properties.setProperties({
      BAD_STOCK_LAST_TRIGGER_STATUS:
        "ERROR",

      BAD_STOCK_LAST_TRIGGER_ERROR:
        String(error.message || error),

      BAD_STOCK_LAST_TRIGGER_ERROR_TIME:
        String(new Date().getTime())
    });

    Logger.log(error.stack || error);
    throw error;

  } finally {
    lock.releaseLock();
  }

  /*
   * 아래 작업은 메인 Lock 해제 후 실행
   * 중첩 Lock 충돌 방지
   */

  /*
   * 신규 FD/FL 상품 판매가 조회
   */
  try {
    syncNaverMaxPricesFromBadStockLogJWCHA();

  } catch (priceError) {
    Logger.log(
      "네이버 가격 자동 조회 실패: " +
      priceError.message
    );
  }

  /*
   * 신규 FD 또는 FL이 발생했을 때만 AI 자동 분석
   *
   * CR만 발생한 경우에는 실행하지 않음
   * 신규 발생이 전혀 없는 경우에도 실행하지 않음
   */
  if (appendResult.centerLossNewCount > 0) {
    try {
      runBadStockAiAnalysisJWCHA();

      properties.setProperties({
        BAD_STOCK_LAST_AUTO_AI_TIME:
          String(new Date().getTime()),

        BAD_STOCK_LAST_AUTO_AI_STATUS:
          "SUCCESS"
      });

      Logger.log(
        "신규 센터 LOSS 발생으로 AI 자동 분석 완료"
      );

    } catch (aiError) {
      properties.setProperties({
        BAD_STOCK_LAST_AUTO_AI_STATUS:
          "ERROR",

        BAD_STOCK_LAST_AUTO_AI_ERROR:
          String(aiError.message || aiError)
      });

      /*
       * AI 오류 때문에 전체 자동 갱신을 실패 처리하지 않음
       */
      Logger.log(
        "AI 자동 분석 실패: " +
        aiError.message
      );
    }

  } else {
    Logger.log(
      "신규 FD/FL이 없어 AI 자동 분석 생략"
    );
  }
}

/***************************************************************
 * 최초 시트 구성
 ***************************************************************/

function setupBadStockMonitoringJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);

  const rawHeaders = [
    "No.",
    "장비구분",
    "보관방식",
    "로케이션",
    "LOT번호",
    "고객사",
    "상품코드",
    "상품바코드",
    "상품 취급온도",
    "상품구분",
    "상품명",
    "출고금지일",
    "경과일",
    "유통기한",
    "제조일자",
    "출고 가능 수량",
    "출고 신청 수량",
    "지시 수량",
    "유통기한 경과재고",
    "총재고",
    "로케이션 구분",
    "로케이션 취급온도",
    "불용ZONE"
  ];

  const logHeaders = [
    "갱신시간",
    "발생일",
    "발생월",
    "발생시간대",
    "불용ZONE",
    "불용 구분",
    "고객사",
    "상품코드",
    "상품바코드",
    "상품명",
    "상품구분",
    "LOT번호",
    "유통기한",
    "제조일자",
    "로케이션",
    "이전수량",
    "현재수량",
    "발생수량",
    "PREV 파일명",
    "CUR 파일명",
    "비교ID",
    "중복방지키"
  ];

  const hourlyHeaders = [
    "발생일",
    "발생시간대",
    "불용ZONE",
    "불용 구분",
    "발생건수",
    "발생수량",
    "갱신시간"
  ];

  const dailyHeaders = [
    "발생일",
    "불용ZONE",
    "불용 구분",
    "발생건수",
    "발생수량",
    "갱신시간"
  ];

  const monthlyHeaders = [
    "발생월",
    "불용ZONE",
    "불용 구분",
    "발생건수",
    "발생수량",
    "갱신시간"
  ];

  prepareBadStockSheetJWCHA(
    ss,
    config.PREV_SHEET_NAME,
    rawHeaders
  );

  prepareBadStockSheetJWCHA(
    ss,
    config.CUR_SHEET_NAME,
    rawHeaders
  );

  prepareBadStockSheetJWCHA(
    ss,
    config.LOG_SHEET_NAME,
    logHeaders
  );

  prepareBadStockSheetJWCHA(
    ss,
    config.HOURLY_SHEET_NAME,
    hourlyHeaders
  );

  prepareBadStockSheetJWCHA(
    ss,
    config.DAILY_SHEET_NAME,
    dailyHeaders
  );

  prepareBadStockSheetJWCHA(
    ss,
    config.MONTHLY_SHEET_NAME,
    monthlyHeaders
  );

  if (!ss.getSheetByName(config.DASHBOARD_SHEET_NAME)) {
    ss.insertSheet(config.DASHBOARD_SHEET_NAME, 0);
  }

  if (!ss.getSheetByName(config.AI_SHEET_NAME)) {
    ss.insertSheet(config.AI_SHEET_NAME);
  }

  setupLossManagementSheetJWCHA(ss);

  formatBadStockSheetsJWCHA(ss);
}


function prepareBadStockSheetJWCHA(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers]);

  sheet.setFrozenRows(1);

  return sheet;
}


/***************************************************************
 * PREV / CUR 업데이트
 ***************************************************************/

function updateCurAndPrevFromLatestFilesJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);

  const prevSheet = ss.getSheetByName(config.PREV_SHEET_NAME);
  const curSheet = ss.getSheetByName(config.CUR_SHEET_NAME);

  if (!prevSheet || !curSheet) {
    throw new Error(
      "PREV 또는 CUR 시트가 없습니다. 최초 시트 구성을 먼저 실행하세요."
    );
  }

  const prevFile = getLatestLocStockFileJWCHA(
    config.PREV_FOLDER_ID
  );

  const curFile = getLatestLocStockFileJWCHA(
    config.CUR_FOLDER_ID
  );

  if (!prevFile) {
    throw new Error(
      "PREV 폴더에 LOC재고현황 파일이 없습니다."
    );
  }

  if (!curFile) {
    throw new Error(
      "CUR 폴더에 LOC재고현황 파일이 없습니다."
    );
  }

  processAndCopyJWCHA(prevFile, prevSheet);
  processAndCopyJWCHA(curFile, curSheet);

  PropertiesService
    .getScriptProperties()
    .setProperties({
      BAD_STOCK_PREV_FILE_ID: prevFile.getId(),
      BAD_STOCK_PREV_FILE_NAME: prevFile.getName(),
      BAD_STOCK_PREV_FILE_TIME:
        String(prevFile.getLastUpdated().getTime()),

      BAD_STOCK_CUR_FILE_ID: curFile.getId(),
      BAD_STOCK_CUR_FILE_NAME: curFile.getName(),
      BAD_STOCK_CUR_FILE_TIME:
        String(curFile.getLastUpdated().getTime())
    });

  const now = new Date();

  curSheet.getRange("Z2").setValue("업데이트 완료");
  curSheet.getRange("AA2").setValue(now);
  curSheet.getRange("AA2").setNumberFormat(
    "yyyy-mm-dd hh:mm:ss"
  );

  curSheet.getRange("Z3").setValue("PREV 파일");
  curSheet.getRange("AA3").setValue(prevFile.getName());

  curSheet.getRange("Z4").setValue("CUR 파일");
  curSheet.getRange("AA4").setValue(curFile.getName());
}


/***************************************************************
 * 폴더 최신 파일
 ***************************************************************/

function getLatestLocStockFileJWCHA(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();

  let latestFile = null;
  let latestTime = 0;

  while (files.hasNext()) {
    const file = files.next();

    const name = file.getName();
    const mimeType = file.getMimeType();

    if (!name.includes("LOC재고현황")) continue;
    if (name.includes("사본")) continue;
    if (name.includes("temp_convert_file")) continue;
    if (mimeType === MimeType.GOOGLE_SHEETS) continue;

    const updatedTime = file.getLastUpdated().getTime();

    if (updatedTime > latestTime) {
      latestTime = updatedTime;
      latestFile = file;
    }
  }

  return latestFile;
}


/***************************************************************
 * XLSX 변환 및 복사
 *
 * Apps Script 서비스에서 Drive API 추가 필요
 ***************************************************************/

function processAndCopyJWCHA(excelFile, targetSheet) {
  if (!targetSheet) {
    throw new Error("데이터를 복사할 대상 시트가 없습니다.");
  }

  let tempFileId = "";

  try {
    const tempFile = Drive.Files.copy(
      {
        title:
          "temp_convert_file_" +
          new Date().getTime()
      },
      excelFile.getId(),
      {
        convert: true
      }
    );

    tempFileId = tempFile.id;

    const tempSs = SpreadsheetApp.openById(tempFileId);
    const tempSheet = tempSs.getSheets()[0];

    const lastRow = tempSheet.getLastRow();
    const lastColumn = tempSheet.getLastColumn();

    if (lastRow < 1) {
      throw new Error(
        excelFile.getName() +
        " 파일에 데이터가 없습니다."
      );
    }

    if (lastColumn < 22) {
      throw new Error(
        excelFile.getName() +
        " 파일의 열 개수가 부족합니다. 열 수: " +
        lastColumn
      );
    }

    const readColumnCount = Math.min(
      Math.max(lastColumn, 22),
      23
    );

    const sourceData = tempSheet
      .getRange(
        1,
        1,
        lastRow,
        readColumnCount
      )
      .getValues();

    const data = sourceData.map(function(row) {
      const copiedRow = row.slice(0, 23);

      while (copiedRow.length < 23) {
        copiedRow.push("");
      }

      return copiedRow;
    });

    data[0][22] = "불용ZONE";

    for (let i = 1; i < data.length; i++) {
      const location = normalizeTextJWCHA(data[i][3]);

      let badZone = "";

      if (location.startsWith("CR")) {
        badZone = "CR";
      } else if (location.startsWith("FD")) {
        badZone = "FD";
      } else if (location.startsWith("FL")) {
        badZone = "FL";
      }

      data[i][22] = badZone;
    }

    targetSheet.clearContents();

    targetSheet
      .getRange(1, 1, data.length, 23)
      .setValues(data);

    targetSheet.setFrozenRows(1);

  } finally {
    if (tempFileId) {
      try {
        DriveApp
          .getFileById(tempFileId)
          .setTrashed(true);

      } catch (error) {
        Logger.log(
          "임시 변환 파일 삭제 실패: " +
          error.message
        );
      }
    }
  }
}


/***************************************************************
 * 발생내역 LOG 누적
 ***************************************************************/

function appendBadStockLogJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);

  const prevSheet = ss.getSheetByName(
    config.PREV_SHEET_NAME
  );

  const curSheet = ss.getSheetByName(
    config.CUR_SHEET_NAME
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (!prevSheet || !curSheet || !logSheet) {
    throw new Error(
      "PREV, CUR 또는 불용재고_LOG 시트가 없습니다."
    );
  }

  const prevData = prevSheet
    .getDataRange()
    .getValues();

  const curData = curSheet
    .getDataRange()
    .getValues();

  if (prevData.length < 2) {
    throw new Error(
      "PREV 시트에 비교 데이터가 없습니다."
    );
  }

  if (curData.length < 2) {
    throw new Error(
      "CUR 시트에 비교 데이터가 없습니다."
    );
  }

  const prevMap = aggregateBadStockDataJWCHA(prevData);
  const curMap = aggregateBadStockDataJWCHA(curData);

  const properties =
    PropertiesService.getScriptProperties();

  const prevFileId =
    properties.getProperty(
      "BAD_STOCK_PREV_FILE_ID"
    ) || "PREV";

  const prevFileName =
    properties.getProperty(
      "BAD_STOCK_PREV_FILE_NAME"
    ) || "PREV";

  const curFileId =
    properties.getProperty(
      "BAD_STOCK_CUR_FILE_ID"
    ) || "CUR";

  const curFileName =
    properties.getProperty(
      "BAD_STOCK_CUR_FILE_NAME"
    ) || "CUR";

  const refreshTime = new Date();

  const occurrenceDate = Utilities.formatDate(
    refreshTime,
    config.TIMEZONE,
    "yyyy-MM-dd"
  );

  const occurrenceMonth = Utilities.formatDate(
    refreshTime,
    config.TIMEZONE,
    "yyyy-MM"
  );

  const occurrenceHour = Utilities.formatDate(
    refreshTime,
    config.TIMEZONE,
    "yyyy-MM-dd HH:00"
  );

  const comparisonId =
    prevFileId + "__" + curFileId;

  const existingKeys =
    getExistingBadStockKeysJWCHA(logSheet);

  /*
   * 핵심 중복 방지:
   * PREV 파일이 고정된 상태에서 CUR 파일만 바뀌면
   * 같은 0→1, 8→10 증가분이 매번 다시 계산되는 문제가 있었다.
   *
   * 상품/LOT/ZONE별로 과거 LOG에 기록된 최대 현재수량을 읽고,
   * PREV 수량과 과거 최대 현재수량 중 큰 값을 실제 비교 기준으로 사용한다.
   */
  const loggedMaxCurrentMap =
    getLoggedMaxCurrentQtyByStableKeyJWCHA(
      logSheet
    );

  const logRows = [];

  curMap.forEach(function(curItem, key) {
    const prevItem = prevMap.get(key);

    const originalPreviousQty = prevItem
      ? prevItem.totalQty
      : 0;

    const loggedMaxCurrentQty =
      loggedMaxCurrentMap.has(key)
        ? loggedMaxCurrentMap.get(key)
        : originalPreviousQty;

    const effectivePreviousQty = Math.max(
      originalPreviousQty,
      loggedMaxCurrentQty
    );

    const currentQty = curItem.totalQty;
    const increaseQty =
      currentQty - effectivePreviousQty;

    /*
     * 현재수량이 이미 기록된 최고수량과 같거나 작으면
     * 신규 발생이 아니므로 LOG에 추가하지 않는다.
     */
    if (increaseQty <= 0) return;

    const duplicateKey =
      comparisonId + "__" + key;

    if (existingKeys.has(duplicateKey)) return;

    logRows.push([
      refreshTime,
      occurrenceDate,
      occurrenceMonth,
      occurrenceHour,
      curItem.zone,
      getBadStockCategoryJWCHA(curItem.zone),
      curItem.customer,
      curItem.productCode,
      curItem.barcode,
      curItem.productName,
      curItem.productType,
      curItem.lot,
      curItem.expirationDate,
      curItem.manufactureDate,
      curItem.location,
      effectivePreviousQty,
      currentQty,
      increaseQty,
      prevFileName,
      curFileName,
      comparisonId,
      duplicateKey
    ]);

    /*
     * 같은 실행 안에서 동일 키가 다시 평가되더라도
     * 현재수량을 즉시 최대값으로 반영한다.
     */
    loggedMaxCurrentMap.set(
      key,
      Math.max(
        loggedMaxCurrentQty,
        currentQty
      )
    );
  });

  if (logRows.length > 0) {
    const startRow = Math.max(
      logSheet.getLastRow() + 1,
      2
    );

    logSheet
      .getRange(
        startRow,
        1,
        logRows.length,
        logRows[0].length
      )
      .setValues(logRows);

    logSheet
      .getRange(
        startRow,
        1,
        logRows.length,
        1
      )
      .setNumberFormat(
        "yyyy-mm-dd hh:mm:ss"
      );
  }

  Logger.log(
    "불용재고 신규 발생 LOG: " +
    logRows.length +
    "건"
  );

  const centerLossRows =
    logRows.filter(function(row) {
      const zone =
        String(row[4] || "")
          .trim()
          .toUpperCase();

      return zone === "FD" || zone === "FL";
    });

  return {
    totalNewCount: logRows.length,

    centerLossNewCount:
      centerLossRows.length,

    centerLossNewQty:
      centerLossRows.reduce(
        function(sum, row) {
          return (
            sum +
            toNumberJWCHA(row[17])
          );
        },
        0
      )
  };
}


/***************************************************************
 * 동일 상품/LOT/ZONE 합산
 ***************************************************************/

function aggregateBadStockDataJWCHA(data) {
  const map = new Map();

  for (let i = 1; i < data.length; i++) {
    const location =
      normalizeTextJWCHA(data[i][3]);

    const lot =
      normalizeTextJWCHA(data[i][4]);

    const customer =
      normalizeTextJWCHA(data[i][5]);

    const productCode =
      normalizeTextJWCHA(data[i][6]);

    const barcode =
      normalizeTextJWCHA(data[i][7]);

    const zone =
      normalizeTextJWCHA(data[i][22]);

    if (!["CR", "FD", "FL"].includes(zone)) {
      continue;
    }

    const totalQty =
      toNumberJWCHA(data[i][19]);

    const key = [
      customer,
      productCode,
      barcode,
      lot,
      zone
    ].join("|");

    if (!map.has(key)) {
      map.set(key, {
        totalQty: 0,
        locations: [],
        location: "",
        lot: lot,
        customer: customer,
        productCode: productCode,
        barcode: barcode,
        productType: data[i][9],
        productName: data[i][10],
        expirationDate: data[i][13],
        manufactureDate: data[i][14],
        zone: zone
      });
    }

    const item = map.get(key);

    item.totalQty += totalQty;

    if (
      location &&
      !item.locations.includes(location)
    ) {
      item.locations.push(location);
    }

    item.location =
      item.locations.join(", ");
  }

  return map;
}


/***************************************************************
 * 중복방지키 조회
 ***************************************************************/

function getExistingBadStockKeysJWCHA(logSheet) {
  const result = new Set();
  const lastRow = logSheet.getLastRow();

  if (lastRow < 2) return result;

  const values = logSheet
    .getRange(2, 22, lastRow - 1, 1)
    .getDisplayValues();

  values.forEach(function(row) {
    if (row[0]) {
      result.add(row[0]);
    }
  });

  return result;
}




/***************************************************************
 * LOG 안정 키 / 과거 최대수량 / 기존 중복 정리
 ***************************************************************/

function makeBadStockStableKeyFromLogRowJWCHA(row) {
  const customer =
    normalizeTextJWCHA(row[6]);

  const productCode =
    normalizeTextJWCHA(row[7]);

  const barcode =
    normalizeTextJWCHA(row[8]);

  const lot =
    normalizeTextJWCHA(row[11]);

  const zone =
    normalizeTextJWCHA(row[4]);

  return [
    customer,
    productCode,
    barcode,
    lot,
    zone
  ].join("|");
}


function getLoggedMaxCurrentQtyByStableKeyJWCHA(
  logSheet
) {
  const result = new Map();
  const lastRow = logSheet.getLastRow();

  if (lastRow < 2) {
    return result;
  }

  const values = logSheet
    .getRange(
      2,
      1,
      lastRow - 1,
      22
    )
    .getValues();

  values.forEach(function(row) {
    const zone =
      normalizeTextJWCHA(row[4]);

    if (!["CR", "FD", "FL"].includes(zone)) {
      return;
    }

    const key =
      makeBadStockStableKeyFromLogRowJWCHA(
        row
      );

    const currentQty =
      toNumberJWCHA(row[16]);

    const existing =
      result.has(key)
        ? result.get(key)
        : 0;

    if (currentQty > existing) {
      result.set(key, currentQty);
    }
  });

  return result;
}


/**
 * 과거에 이미 쌓인 중복 LOG를 한 번 정리한다.
 *
 * - 정리 전 시트를 자동 백업
 * - 같은 상품/LOT/ZONE에서 현재수량이 늘지 않은 반복 행 삭제
 * - 실제 추가 증가분이 있으면 발생수량을 차이만큼 보정
 */
function cleanupDuplicateBadStockLogJWCHA() {
  const config =
    BAD_STOCK_CONFIG_JWCHA;

  const ss = SpreadsheetApp.openById(
    config.TARGET_SS_ID
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (!logSheet) {
    throw new Error(
      "불용재고_LOG 시트가 없습니다."
    );
  }

  const lastRow = logSheet.getLastRow();

  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert(
      "정리할 LOG가 없습니다."
    );

    return;
  }

  const allValues = logSheet
    .getRange(
      1,
      1,
      lastRow,
      22
    )
    .getValues();

  const header = allValues[0];
  const body = allValues.slice(1);

  /*
   * 원본 백업
   */
  const backupName =
    "불용재고_LOG_백업_" +
    Utilities.formatDate(
      new Date(),
      config.TIMEZONE,
      "yyyyMMdd_HHmmss"
    );

  const backupSheet =
    ss.insertSheet(backupName);

  backupSheet
    .getRange(
      1,
      1,
      allValues.length,
      22
    )
    .setValues(allValues);

  backupSheet.setFrozenRows(1);

  /*
   * 시간순으로 판별하되 최종 출력도 시간순 유지
   */
  const indexedRows =
    body.map(function(row, index) {
      const timeValue =
        Object.prototype.toString.call(row[0]) ===
          "[object Date]" &&
        !isNaN(row[0])
          ? row[0].getTime()
          : index;

      return {
        row: row.slice(),
        index: index,
        timeValue: timeValue
      };
    });

  indexedRows.sort(function(a, b) {
    if (a.timeValue !== b.timeValue) {
      return a.timeValue - b.timeValue;
    }

    return a.index - b.index;
  });

  const maxCurrentMap = new Map();
  const cleanedRows = [];

  indexedRows.forEach(function(entry) {
    const row = entry.row;

    const zone =
      normalizeTextJWCHA(row[4]);

    if (!["CR", "FD", "FL"].includes(zone)) {
      return;
    }

    const key =
      makeBadStockStableKeyFromLogRowJWCHA(
        row
      );

    const rowPreviousQty =
      toNumberJWCHA(row[15]);

    const rowCurrentQty =
      toNumberJWCHA(row[16]);

    const knownMax =
      maxCurrentMap.has(key)
        ? maxCurrentMap.get(key)
        : rowPreviousQty;

    const effectivePreviousQty =
      Math.max(
        rowPreviousQty,
        knownMax
      );

    const realIncreaseQty =
      rowCurrentQty -
      effectivePreviousQty;

    /*
     * 현재수량이 이전에 기록된 최고수량보다 늘지 않았다면
     * 같은 재고를 다시 기록한 중복 행이므로 제거한다.
     */
    if (realIncreaseQty <= 0) {
      maxCurrentMap.set(
        key,
        Math.max(
          knownMax,
          rowCurrentQty
        )
      );

      return;
    }

    row[15] = effectivePreviousQty;
    row[17] = realIncreaseQty;

    cleanedRows.push(row);

    maxCurrentMap.set(
      key,
      Math.max(
        knownMax,
        rowCurrentQty
      )
    );
  });

  /*
   * 기존 본문 삭제 후 정리된 데이터 재작성
   */
  if (lastRow > 1) {
    logSheet
      .getRange(
        2,
        1,
        lastRow - 1,
        22
      )
      .clearContent();
  }

  if (cleanedRows.length > 0) {
    logSheet
      .getRange(
        2,
        1,
        cleanedRows.length,
        22
      )
      .setValues(cleanedRows);

    logSheet
      .getRange(
        2,
        1,
        cleanedRows.length,
        1
      )
      .setNumberFormat(
        "yyyy-mm-dd hh:mm:ss"
      );
  }

  updateBadStockSummaryJWCHA();

  PropertiesService
    .getScriptProperties()
    .setProperty(
      "BAD_STOCK_LAST_AUTO_REFRESH_TIME",
      String(new Date().getTime())
    );

  SpreadsheetApp.flush();

  const removedCount =
    body.length - cleanedRows.length;

  SpreadsheetApp.getUi().alert(
    "기존 중복 LOG 정리 완료\n\n" +
    "정리 전: " +
    body.length +
    "건\n" +
    "정리 후: " +
    cleanedRows.length +
    "건\n" +
    "제거/보정: " +
    removedCount +
    "건\n\n" +
    "백업 시트: " +
    backupName
  );
}


/***************************************************************
 * 시간대별 / 일별 / 월별 집계
 ***************************************************************/

function updateBadStockSummaryJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  const hourlySheet = ss.getSheetByName(
    config.HOURLY_SHEET_NAME
  );

  const dailySheet = ss.getSheetByName(
    config.DAILY_SHEET_NAME
  );

  const monthlySheet = ss.getSheetByName(
    config.MONTHLY_SHEET_NAME
  );

  if (
    !logSheet ||
    !hourlySheet ||
    !dailySheet ||
    !monthlySheet
  ) {
    throw new Error(
      "LOG 또는 집계 시트를 찾을 수 없습니다."
    );
  }

  clearBadStockSummaryJWCHA(hourlySheet);
  clearBadStockSummaryJWCHA(dailySheet);
  clearBadStockSummaryJWCHA(monthlySheet);

  const lastRow = logSheet.getLastRow();

  if (lastRow < 2) return;

  const logData = logSheet
    .getRange(2, 1, lastRow - 1, 22)
    .getValues();

  const hourlyMap = new Map();
  const dailyMap = new Map();
  const monthlyMap = new Map();

  logData.forEach(function(row) {
    const occurrenceDate =
      normalizeDateTextJWCHA(row[1]);

    const occurrenceMonth =
      normalizeMonthTextJWCHA(row[2]);

    const occurrenceHour =
      normalizeHourTextJWCHA(row[3]);

    const zone =
      normalizeTextJWCHA(row[4]);

    const category = row[5];

    const increaseQty =
      toNumberJWCHA(row[17]);

    if (
      !occurrenceDate ||
      !occurrenceMonth ||
      !occurrenceHour ||
      !zone ||
      increaseQty <= 0
    ) {
      return;
    }

    const hourlyKey = [
      occurrenceDate,
      occurrenceHour,
      zone
    ].join("|");

    if (!hourlyMap.has(hourlyKey)) {
      hourlyMap.set(hourlyKey, {
        occurrenceDate: occurrenceDate,
        occurrenceHour: occurrenceHour,
        zone: zone,
        category: category,
        count: 0,
        quantity: 0
      });
    }

    const hourlyItem =
      hourlyMap.get(hourlyKey);

    hourlyItem.count++;
    hourlyItem.quantity += increaseQty;

    const dailyKey = [
      occurrenceDate,
      zone
    ].join("|");

    if (!dailyMap.has(dailyKey)) {
      dailyMap.set(dailyKey, {
        occurrenceDate: occurrenceDate,
        zone: zone,
        category: category,
        count: 0,
        quantity: 0
      });
    }

    const dailyItem =
      dailyMap.get(dailyKey);

    dailyItem.count++;
    dailyItem.quantity += increaseQty;

    const monthlyKey = [
      occurrenceMonth,
      zone
    ].join("|");

    if (!monthlyMap.has(monthlyKey)) {
      monthlyMap.set(monthlyKey, {
        occurrenceMonth: occurrenceMonth,
        zone: zone,
        category: category,
        count: 0,
        quantity: 0
      });
    }

    const monthlyItem =
      monthlyMap.get(monthlyKey);

    monthlyItem.count++;
    monthlyItem.quantity += increaseQty;
  });

  const refreshTime = new Date();

  const hourlyRows =
    Array.from(hourlyMap.values())
      .sort(function(a, b) {
        return String(b.occurrenceHour)
          .localeCompare(String(a.occurrenceHour));
      })
      .map(function(item) {
        return [
          item.occurrenceDate,
          item.occurrenceHour,
          item.zone,
          item.category,
          item.count,
          item.quantity,
          refreshTime
        ];
      });

  const dailyRows =
    Array.from(dailyMap.values())
      .sort(function(a, b) {
        const dateCompare =
          String(b.occurrenceDate)
            .localeCompare(
              String(a.occurrenceDate)
            );

        if (dateCompare !== 0) {
          return dateCompare;
        }

        return String(a.zone)
          .localeCompare(String(b.zone));
      })
      .map(function(item) {
        return [
          item.occurrenceDate,
          item.zone,
          item.category,
          item.count,
          item.quantity,
          refreshTime
        ];
      });

  const monthlyRows =
    Array.from(monthlyMap.values())
      .sort(function(a, b) {
        const monthCompare =
          String(b.occurrenceMonth)
            .localeCompare(
              String(a.occurrenceMonth)
            );

        if (monthCompare !== 0) {
          return monthCompare;
        }

        return String(a.zone)
          .localeCompare(String(b.zone));
      })
      .map(function(item) {
        return [
          item.occurrenceMonth,
          item.zone,
          item.category,
          item.count,
          item.quantity,
          refreshTime
        ];
      });

  writeBadStockSummaryJWCHA(
    hourlySheet,
    hourlyRows
  );

  writeBadStockSummaryJWCHA(
    dailySheet,
    dailyRows
  );

  writeBadStockSummaryJWCHA(
    monthlySheet,
    monthlyRows
  );
}


function writeBadStockSummaryJWCHA(sheet, rows) {
  if (rows.length < 1) return;

  sheet
    .getRange(
      2,
      1,
      rows.length,
      rows[0].length
    )
    .setValues(rows);

  sheet
    .getRange(
      2,
      rows[0].length,
      rows.length,
      1
    )
    .setNumberFormat(
      "yyyy-mm-dd hh:mm:ss"
    );
}


function clearBadStockSummaryJWCHA(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) return;

  sheet
    .getRange(
      2,
      1,
      lastRow - 1,
      sheet.getMaxColumns()
    )
    .clearContent();
}


/***************************************************************
 * DASHBOARD
 ***************************************************************/

function buildBadStockDashboardJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (!logSheet) {
    throw new Error(
      "불용재고_LOG 시트가 없습니다."
    );
  }

  let dashboard = ss.getSheetByName(
    config.DASHBOARD_SHEET_NAME
  );

  if (!dashboard) {
    dashboard = ss.insertSheet(
      config.DASHBOARD_SHEET_NAME,
      0
    );
  }

  dashboard.getCharts().forEach(function(chart) {
    dashboard.removeChart(chart);
  });

  dashboard
    .getRange(
      1,
      1,
      dashboard.getMaxRows(),
      dashboard.getMaxColumns()
    )
    .breakApart();

  dashboard.clear();
  dashboard.setHiddenGridlines(true);

  ensureSheetSizeJWCHA(dashboard, 110, 35);

  setDashboardWidthsJWCHA(dashboard);

  dashboard
    .getRange("B2:L3")
    .merge()
    .setValue("JAVIS LOSS DASHBOARD")
    .setFontSize(24)
    .setFontWeight("bold")
    .setHorizontalAlignment("left")
    .setVerticalAlignment("middle")
    .setFontColor("#FFFFFF")
    .setBackground("#101827");

  dashboard
    .getRange("B4:L4")
    .merge()
    .setValue(
      "CR 고객사 품질·귀책 / FD 센터 파손 / FL 센터 분실"
    )
    .setFontColor("#CBD5E1")
    .setBackground("#101827")
    .setHorizontalAlignment("left");

  dashboard
    .getRange("B2:L4")
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      "#263244",
      SpreadsheetApp.BorderStyle.SOLID
    );

  makeDashboardCardJWCHA(
    dashboard,
    "B6:C6",
    "B7:C9",
    "오늘 센터 LOSS",
    '=SUM(SUMIFS(\'불용재고_LOG\'!R:R,\'불용재고_LOG\'!B:B,TEXT(TODAY(),"yyyy-mm-dd"),\'불용재고_LOG\'!E:E,{"FD","FL"}))',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "E6:F6",
    "E7:F9",
    "이번 달 LOSS",
    '=SUM(SUMIFS(\'불용재고_LOG\'!R:R,\'불용재고_LOG\'!C:C,TEXT(TODAY(),"yyyy-mm"),\'불용재고_LOG\'!E:E,{"FD","FL"}))',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "H6:I6",
    "H7:I9",
    "센터 파손 FD",
    '=SUMIF(\'불용재고_LOG\'!E:E,"FD",\'불용재고_LOG\'!R:R)',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "K6:L6",
    "K7:L9",
    "센터 분실 FL",
    '=SUMIF(\'불용재고_LOG\'!E:E,"FL",\'불용재고_LOG\'!R:R)',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "B11:C11",
    "B12:C14",
    "고객사 귀책 CR",
    '=SUMIF(\'불용재고_LOG\'!E:E,"CR",\'불용재고_LOG\'!R:R)',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "E11:F11",
    "E12:F14",
    "누적 발생건수",
    '=COUNTIF(\'불용재고_LOG\'!E2:E,"FD")+COUNTIF(\'불용재고_LOG\'!E2:E,"FL")',
    '0" 건"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "H11:I11",
    "H12:I14",
    "누적 발생수량",
    '=SUM(SUMIF(\'불용재고_LOG\'!E2:E,{"FD","FL"},\'불용재고_LOG\'!R2:R))',
    '0" EA"'
  );

  makeDashboardCardJWCHA(
    dashboard,
    "K11:L11",
    "K12:L14",
    "최근 갱신시간",
    '=IFERROR(MAX(\'불용재고_LOG\'!A2:A),"")',
    "yyyy-mm-dd hh:mm"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "B17:F17",
    "시간대별 발생량"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "H17:L17",
    "최근 일별 발생량"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "B34:F34",
    "월별 발생량"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "H34:L34",
    "센터 LOSS 유형별 비율"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "B51:F51",
    "고객사 TOP 10"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "H51:L51",
    "상품 TOP 10"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "B68:L68",
    "AI 운영 분석"
  );

  makeDashboardTitleJWCHA(
    dashboard,
    "B82:L82",
    "최근 발생내역"
  );

  dashboard
    .getRange("N2")
    .setFormula(
      '=QUERY({' +
      'ARRAYFORMULA(IF(\'불용재고_LOG\'!D2:D="","",RIGHT(\'불용재고_LOG\'!D2:D,5))),' +
      '\'불용재고_LOG\'!B2:B,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col3) ' +
      'where Col2 = \'"&TEXT(TODAY(),"yyyy-mm-dd")&"\' ' +
      'and Col1 is not null ' +
      'group by Col1 ' +
      'order by Col1 ' +
      'label Col1 \'시간대\',sum(Col3) \'발생수량\'",0)'
    );

  dashboard
    .getRange("Q2")
    .setFormula(
      '=QUERY({' +
      '\'불용재고_LOG\'!B2:B,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col2) ' +
      'where Col1 is not null ' +
      'group by Col1 ' +
      'order by Col1 desc ' +
      'limit 14 ' +
      'label Col1 \'발생일\',sum(Col2) \'발생수량\'",0)'
    );

  dashboard
    .getRange("T2")
    .setFormula(
      '=QUERY({' +
      '\'불용재고_LOG\'!C2:C,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col2) ' +
      'where Col1 is not null ' +
      'group by Col1 ' +
      'order by Col1 ' +
      'label Col1 \'발생월\',sum(Col2) \'발생수량\'",0)'
    );

  dashboard
    .getRange("W2")
    .setFormula(
      '=QUERY({' +
      '\'불용재고_LOG\'!E2:E,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col2) ' +
      'where Col1 is not null ' +
      'group by Col1 ' +
      'label Col1 \'ZONE\',sum(Col2) \'발생수량\'",0)'
    );

  dashboard
    .getRange("Z2")
    .setFormula(
      '=QUERY({' +
      '\'불용재고_LOG\'!G2:G,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col2) ' +
      'where Col1 is not null ' +
      'group by Col1 ' +
      'order by sum(Col2) desc ' +
      'limit 10 ' +
      'label Col1 \'고객사\',sum(Col2) \'발생수량\'",0)'
    );

  dashboard
    .getRange("AC2")
    .setFormula(
      '=QUERY({' +
      '\'불용재고_LOG\'!J2:J,' +
      '\'불용재고_LOG\'!R2:R},' +
      '"select Col1,sum(Col2) ' +
      'where Col1 is not null ' +
      'group by Col1 ' +
      'order by sum(Col2) desc ' +
      'limit 10 ' +
      'label Col1 \'상품명\',sum(Col2) \'발생수량\'",0)'
    );

  dashboard
    .getRange("B70:L79")
    .merge()
    .setValue(getLatestAiAnalysisTextJWCHA())
    .setWrap(true)
    .setVerticalAlignment("top")
    .setFontSize(11)
    .setBackground("#F8FAFC")
    .setBorder(
      true,
      true,
      true,
      true,
      false,
      false,
      "#CBD5E1",
      SpreadsheetApp.BorderStyle.SOLID
    );

  dashboard
    .getRange("B84")
    .setFormula(
      '=QUERY(\'불용재고_LOG\'!A2:R,' +
      '"select A,E,F,G,H,J,O,R ' +
      'where A is not null ' +
      'order by A desc ' +
      'limit 20 ' +
      'label A \'갱신시간\',' +
      'E \'ZONE\',' +
      'F \'불용 구분\',' +
      'G \'고객사\',' +
      'H \'상품코드\',' +
      'J \'상품명\',' +
      'O \'로케이션\',' +
      'R \'발생수량\'",0)'
    );

  SpreadsheetApp.flush();

  createDashboardChartsJWCHA(dashboard);

  dashboard
    .getRange("B84:I84")
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1E293B")
    .setHorizontalAlignment("center");

  dashboard
    .getRange("B85:B110")
    .setNumberFormat("yyyy-mm-dd hh:mm");

  dashboard
    .getRange("I85:I110")
    .setNumberFormat('0" EA"');

  dashboard
    .getRange("B84:I110")
    .setWrap(true)
    .setVerticalAlignment("middle");

  dashboard.hideColumns(14, 18);

  dashboard.activate();
}


function makeDashboardCardJWCHA(
  sheet,
  titleRange,
  valueRange,
  title,
  formula,
  numberFormat
) {
  sheet
    .getRange(titleRange)
    .merge()
    .setValue(title)
    .setFontWeight("bold")
    .setFontColor("#64748B")
    .setBackground("#F8FAFC")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet
    .getRange(valueRange)
    .merge()
    .setFormula(formula)
    .setFontSize(22)
    .setFontWeight("bold")
    .setFontColor("#0F172A")
    .setBackground("#FFFFFF")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setNumberFormat(numberFormat);

  sheet
    .getRange(titleRange)
    .setBorder(
      true,
      true,
      false,
      true,
      false,
      false,
      "#CBD5E1",
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet
    .getRange(valueRange)
    .setBorder(
      false,
      true,
      true,
      true,
      false,
      false,
      "#CBD5E1",
      SpreadsheetApp.BorderStyle.SOLID
    );
}


function makeDashboardTitleJWCHA(
  sheet,
  rangeA1,
  title
) {
  sheet
    .getRange(rangeA1)
    .merge()
    .setValue(title)
    .setFontSize(14)
    .setFontWeight("bold")
    .setFontColor("#0F172A")
    .setHorizontalAlignment("left");
}


function createDashboardChartsJWCHA(sheet) {
  const chartOptions = {
    backgroundColor: "#FFFFFF",
    chartArea: {
      left: 60,
      top: 45,
      width: "75%",
      height: "65%"
    }
  };

  const hourlyChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange("N2:O26"))
    .setPosition(18, 2, 0, 0)
    .setOption("title", "오늘 시간대별 LOSS")
    .setOption("legend", { position: "none" })
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .setOption(
      "chartArea",
      chartOptions.chartArea
    )
    .build();

  sheet.insertChart(hourlyChart);

  const dailyChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sheet.getRange("Q2:R17"))
    .setPosition(18, 8, 0, 0)
    .setOption("title", "최근 일별 LOSS")
    .setOption("legend", { position: "none" })
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .setOption(
      "chartArea",
      chartOptions.chartArea
    )
    .build();

  sheet.insertChart(dailyChart);

  const monthlyChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange("T2:U30"))
    .setPosition(35, 2, 0, 0)
    .setOption("title", "월별 LOSS 추이")
    .setOption("legend", { position: "none" })
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .setOption(
      "chartArea",
      chartOptions.chartArea
    )
    .build();

  sheet.insertChart(monthlyChart);

  const zoneChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sheet.getRange("W2:X6"))
    .setPosition(35, 8, 0, 0)
    .setOption("title", "FD / FL 센터 LOSS 비율")
    .setOption("pieHole", 0.45)
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .build();

  sheet.insertChart(zoneChart);

  const customerChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange("Z2:AA12"))
    .setPosition(52, 2, 0, 0)
    .setOption("title", "고객사별 LOSS TOP 10")
    .setOption("legend", { position: "none" })
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .setOption(
      "chartArea",
      chartOptions.chartArea
    )
    .build();

  sheet.insertChart(customerChart);

  const productChart = sheet
    .newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange("AC2:AD12"))
    .setPosition(52, 8, 0, 0)
    .setOption("title", "상품별 LOSS TOP 10")
    .setOption("legend", { position: "none" })
    .setOption("height", 300)
    .setOption("width", 540)
    .setOption(
      "backgroundColor",
      chartOptions.backgroundColor
    )
    .setOption(
      "chartArea",
      chartOptions.chartArea
    )
    .build();

  sheet.insertChart(productChart);
}


function ensureSheetSizeJWCHA(
  sheet,
  minimumRows,
  minimumColumns
) {
  if (sheet.getMaxRows() < minimumRows) {
    sheet.insertRowsAfter(
      sheet.getMaxRows(),
      minimumRows - sheet.getMaxRows()
    );
  }

  if (sheet.getMaxColumns() < minimumColumns) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      minimumColumns - sheet.getMaxColumns()
    );
  }
}


function setDashboardWidthsJWCHA(sheet) {
  sheet.setColumnWidth(1, 25);

  [2, 3, 5, 6, 8, 9, 11, 12].forEach(
    function(column) {
      sheet.setColumnWidth(column, 125);
    }
  );

  [4, 7, 10].forEach(function(column) {
    sheet.setColumnWidth(column, 24);
  });
}


/***************************************************************
 * OpenAI API 키 관리
 ***************************************************************/

function setOpenAiApiKeyJWCHA() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.prompt(
    "OpenAI API 키 저장",
    "새로 발급한 OpenAI API 키를 입력하세요.\n" +
    "키는 시트가 아니라 Script Properties에 저장됩니다.",
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  const apiKey =
    String(response.getResponseText() || "").trim();

  if (!apiKey) {
    ui.alert("API 키가 입력되지 않았습니다.");
    return;
  }

  if (!apiKey.startsWith("sk-")) {
    ui.alert(
      "입력한 값이 OpenAI API 키 형식과 다릅니다."
    );

    return;
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(
      BAD_STOCK_CONFIG_JWCHA.OPENAI_KEY_PROPERTY,
      apiKey
    );

  ui.alert(
    "OpenAI API 키가 Script Properties에 저장되었습니다."
  );
}


function deleteOpenAiApiKeyJWCHA() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(
      BAD_STOCK_CONFIG_JWCHA.OPENAI_KEY_PROPERTY
    );

  SpreadsheetApp.getUi().alert(
    "저장된 OpenAI API 키를 삭제했습니다."
  );
}


function getOpenAiApiKeyJWCHA() {
  const properties =
    PropertiesService.getScriptProperties();

  return (
    properties.getProperty("OPENAI_API_KEY_JWCHA") ||
    properties.getProperty("OPENAI_API_KEY") ||
    ""
  );
}


/***************************************************************
 * AI 분석
 ***************************************************************/

function runBadStockAiAnalysisJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const apiKey = getOpenAiApiKeyJWCHA();

  if (!apiKey) {
    throw new Error(
      "OpenAI API 키가 없습니다.\n" +
      "스프레드시트 메뉴에서 OpenAI API 키 저장을 먼저 실행하세요."
    );
  }

  const ss = SpreadsheetApp.openById(
    config.TARGET_SS_ID
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (!logSheet || logSheet.getLastRow() < 2) {
    throw new Error(
      "AI가 분석할 불용재고 LOG가 없습니다."
    );
  }

  const summary = makeBadStockAiSummaryJWCHA(
    logSheet
  );

  const prompt = [
    "당신은 물류센터 센터 귀책 Loss 분석 보조자입니다.",
    "",
    "불용 구분은 다음과 같습니다.",
    "- CR: 고객사 품질 또는 고객사 귀책 파손",
    "- FD: 물류센터 파손",
    "- FL: 물류센터 분실",
    "- CR은 고객사 귀책으로 센터 LOSS 합계와 개선 우선순위에서 제외하고 참고만 하세요.",
    "",
    "아래 집계 데이터만 근거로 FD·FL 센터 귀책 중심 운영 분석을 작성하세요.",
    "데이터에 없는 작업자나 직접 원인을 추측하거나 확정하지 마세요.",
    "",
    "답변 형식:",
    "1. 핵심 요약",
    "2. 가장 큰 Loss 유형",
    "3. 집중 발생 시간대",
    "4. 주요 고객사",
    "5. 반복 발생 상품",
    "6. 우선 확인 항목 3개",
    "7. 데이터 해석 시 주의사항",
    "",
    "각 항목은 현장 관리자가 빠르게 읽을 수 있도록 짧고 명확하게 작성하세요.",
    "",
    "집계 데이터:",
    JSON.stringify(summary, null, 2)
  ].join("\n");

  const response = UrlFetchApp.fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      payload: JSON.stringify({
        model: config.OPENAI_MODEL,
        input: prompt,
        max_output_tokens: 1200
      }),
      muteHttpExceptions: true
    }
  );

  const statusCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(
      "OpenAI API 호출 실패\n" +
      "HTTP " +
      statusCode +
      "\n" +
      responseText
    );
  }

  let json;

  try {
    json = JSON.parse(responseText);

  } catch (error) {
    throw new Error(
      "OpenAI 응답을 JSON으로 읽지 못했습니다."
    );
  }

  const analysisText =
    extractOpenAiResponseTextJWCHA(json);

  if (!analysisText) {
    throw new Error(
      "OpenAI 응답에서 분석 문장을 찾지 못했습니다."
    );
  }

  saveBadStockAiAnalysisJWCHA(
    ss,
    analysisText,
    summary
  );

  buildBadStockDashboardJWCHA();

  SpreadsheetApp.getActive().toast(
    "AI 운영 분석이 완료되었습니다.",
    "JAVIS AI",
    5
  );
}


function makeBadStockAiSummaryJWCHA(logSheet) {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const lastRow = logSheet.getLastRow();

  const values = logSheet
    .getRange(2, 1, lastRow - 1, 22)
    .getValues();

  const now = new Date();
  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  );

  let totalQty = 0;
  let totalCount = 0;
  let crReferenceQty = 0;
  let crReferenceCount = 0;

  const zoneMap = {
    FD: 0,
    FL: 0
  };

  const hourMap = {};
  const customerMap = {};
  const productMap = {};
  const dailyMap = {};

  values.forEach(function(row) {
    const refreshTime = row[0];

    if (
      Object.prototype.toString.call(refreshTime) !==
        "[object Date]" ||
      isNaN(refreshTime) ||
      refreshTime < thirtyDaysAgo
    ) {
      return;
    }

    const zone =
      normalizeTextJWCHA(row[4]);

    const customer =
      String(row[6] || "").trim();

    const product =
      String(row[9] || "").trim();

    const quantity =
      toNumberJWCHA(row[17]);

    if (quantity <= 0) return;

    // CR은 당사 귀책이 아니므로 참고값으로만 분리
    if (zone === "CR") {
      crReferenceCount++;
      crReferenceQty += quantity;
      return;
    }

    if (!["FD", "FL"].includes(zone)) {
      return;
    }

    const hour = Utilities.formatDate(
      refreshTime,
      config.TIMEZONE,
      "HH:00"
    );

    const date = Utilities.formatDate(
      refreshTime,
      config.TIMEZONE,
      "yyyy-MM-dd"
    );

    totalCount++;
    totalQty += quantity;

    zoneMap[zone] =
      (zoneMap[zone] || 0) + quantity;

    hourMap[hour] =
      (hourMap[hour] || 0) + quantity;

    if (customer) {
      customerMap[customer] =
        (customerMap[customer] || 0) +
        quantity;
    }

    if (product) {
      productMap[product] =
        (productMap[product] || 0) +
        quantity;
    }

    dailyMap[date] =
      (dailyMap[date] || 0) + quantity;
  });

  return {
    period: "최근 30일",
    focus: "센터 귀책 FD·FL",
    totalCount: totalCount,
    totalQuantity: totalQty,

    zoneQuantity: zoneMap,

    crReference: {
      count: crReferenceCount,
      quantity: crReferenceQty,
      note: "고객사 품질·귀책으로 센터 LOSS 합계에서 제외"
    },

    topHours: objectToTopListJWCHA(
      hourMap,
      5
    ),

    topCustomers: objectToTopListJWCHA(
      customerMap,
      10
    ),

    topProducts: objectToTopListJWCHA(
      productMap,
      10
    ),

    dailyQuantity: objectToTopListJWCHA(
      dailyMap,
      31,
      true
    )
  };
}


function objectToTopListJWCHA(
  source,
  limit,
  keyAscending
) {
  const entries = Object.keys(source).map(
    function(key) {
      return {
        name: key,
        quantity: source[key]
      };
    }
  );

  if (keyAscending) {
    entries.sort(function(a, b) {
      return String(a.name)
        .localeCompare(String(b.name));
    });

  } else {
    entries.sort(function(a, b) {
      return b.quantity - a.quantity;
    });
  }

  return entries.slice(0, limit);
}


function extractOpenAiResponseTextJWCHA(json) {
  if (
    json &&
    typeof json.output_text === "string" &&
    json.output_text.trim()
  ) {
    return json.output_text.trim();
  }

  if (!json || !Array.isArray(json.output)) {
    return "";
  }

  const parts = [];

  json.output.forEach(function(outputItem) {
    if (!Array.isArray(outputItem.content)) return;

    outputItem.content.forEach(function(contentItem) {
      if (
        contentItem &&
        typeof contentItem.text === "string"
      ) {
        parts.push(contentItem.text);
      }
    });
  });

  return parts.join("\n").trim();
}


function saveBadStockAiAnalysisJWCHA(
  ss,
  analysisText,
  summary
) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  let aiSheet = ss.getSheetByName(
    config.AI_SHEET_NAME
  );

  if (!aiSheet) {
    aiSheet = ss.insertSheet(
      config.AI_SHEET_NAME
    );
  }

  aiSheet.clear();
  aiSheet.setHiddenGridlines(true);

  aiSheet
    .getRange("A1:F2")
    .merge()
    .setValue("JAVIS AI LOSS ANALYSIS")
    .setFontSize(20)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#101827")
    .setVerticalAlignment("middle");

  aiSheet
    .getRange("A3:B3")
    .setValues([
      ["분석시간", new Date()]
    ])
    .setFontWeight("bold");

  aiSheet
    .getRange("B3")
    .setNumberFormat(
      "yyyy-mm-dd hh:mm:ss"
    );

  aiSheet
    .getRange("A5:F5")
    .merge()
    .setValue("AI 운영 분석")
    .setFontSize(14)
    .setFontWeight("bold");

  aiSheet
    .getRange("A6:F25")
    .merge()
    .setValue(analysisText)
    .setWrap(true)
    .setVerticalAlignment("top")
    .setFontSize(11)
    .setBackground("#F8FAFC");

  aiSheet
    .getRange("A27:F27")
    .merge()
    .setValue("AI 입력 집계 데이터")
    .setFontSize(14)
    .setFontWeight("bold");

  aiSheet
    .getRange("A28:F45")
    .merge()
    .setValue(
      JSON.stringify(summary, null, 2)
    )
    .setWrap(true)
    .setVerticalAlignment("top")
    .setFontFamily("Consolas")
    .setBackground("#F8FAFC");

  aiSheet.setColumnWidths(1, 6, 140);

  PropertiesService
    .getScriptProperties()
    .setProperties({
      BAD_STOCK_AI_LATEST_TEXT:
        analysisText,

      BAD_STOCK_AI_LATEST_TIME:
        String(new Date().getTime())
    });
}


function getLatestAiAnalysisTextJWCHA() {
  const properties =
    PropertiesService.getScriptProperties();

  const text =
    properties.getProperty(
      "BAD_STOCK_AI_LATEST_TEXT"
    );

  const timeValue = Number(
    properties.getProperty(
      "BAD_STOCK_AI_LATEST_TIME"
    )
  );

  if (!text) {
    return [
      "아직 AI 분석을 실행하지 않았습니다.",
      "",
      "상단 메뉴에서",
      "불용재고 모니터링 → AI 분석 실행",
      "을 선택하세요."
    ].join("\n");
  }

  const timeText = timeValue
    ? Utilities.formatDate(
        new Date(timeValue),
        BAD_STOCK_CONFIG_JWCHA.TIMEZONE,
        "yyyy-MM-dd HH:mm:ss"
      )
    : "";

  return (
    "분석시간: " +
    timeText +
    "\n\n" +
    text
  );
}


/***************************************************************
 * 불용 구분
 ***************************************************************/

function getBadStockCategoryJWCHA(zone) {
  switch (zone) {
    case "CR":
      return "고객사 품질 / 고객사 귀책 파손";

    case "FD":
      return "센터 파손";

    case "FL":
      return "센터 분실";

    default:
      return "기타";
  }
}


/***************************************************************
 * 시트 서식
 ***************************************************************/

function formatBadStockSheetsJWCHA(ss) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  const sheetNames = [
    config.PREV_SHEET_NAME,
    config.CUR_SHEET_NAME,
    config.LOG_SHEET_NAME,
    config.HOURLY_SHEET_NAME,
    config.DAILY_SHEET_NAME,
    config.MONTHLY_SHEET_NAME
  ];

  sheetNames.forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) return;

    const lastColumn = sheet.getLastColumn();

    if (lastColumn < 1) return;

    sheet
      .getRange(1, 1, 1, lastColumn)
      .setFontWeight("bold")
      .setFontColor("#FFFFFF")
      .setBackground("#1E293B")
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setWrap(true);

    sheet.setFrozenRows(1);
  });

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (logSheet) {
    logSheet.setColumnWidth(1, 150);
    logSheet.setColumnWidth(6, 250);
    logSheet.setColumnWidth(10, 300);
    logSheet.setColumnWidth(15, 220);
    logSheet.setColumnWidth(19, 300);
    logSheet.setColumnWidth(20, 300);

    logSheet
      .getRange("A:A")
      .setNumberFormat(
        "yyyy-mm-dd hh:mm:ss"
      );
  }

  const hourlySheet = ss.getSheetByName(
    config.HOURLY_SHEET_NAME
  );

  if (hourlySheet) {
    hourlySheet.setColumnWidth(4, 250);
  }

  const dailySheet = ss.getSheetByName(
    config.DAILY_SHEET_NAME
  );

  if (dailySheet) {
    dailySheet.setColumnWidth(3, 250);
  }

  const monthlySheet = ss.getSheetByName(
    config.MONTHLY_SHEET_NAME
  );

  if (monthlySheet) {
    monthlySheet.setColumnWidth(3, 250);
  }
}


/***************************************************************
 * 공통 함수
 ***************************************************************/

function normalizeTextJWCHA(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return value
    .toString()
    .trim()
    .toUpperCase();
}


function toNumberJWCHA(value) {
  if (typeof value === "number") {
    return value;
  }

  const text = String(value || "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  return Number(text) || 0;
}


function normalizeDateTextJWCHA(value) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  if (
    Object.prototype.toString.call(value) ===
      "[object Date]" &&
    !isNaN(value)
  ) {
    return Utilities.formatDate(
      value,
      config.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  return String(value || "")
    .trim()
    .substring(0, 10);
}


function normalizeMonthTextJWCHA(value) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  if (
    Object.prototype.toString.call(value) ===
      "[object Date]" &&
    !isNaN(value)
  ) {
    return Utilities.formatDate(
      value,
      config.TIMEZONE,
      "yyyy-MM"
    );
  }

  return String(value || "")
    .trim()
    .substring(0, 7);
}


function normalizeHourTextJWCHA(value) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  if (
    Object.prototype.toString.call(value) ===
      "[object Date]" &&
    !isNaN(value)
  ) {
    return Utilities.formatDate(
      value,
      config.TIMEZONE,
      "yyyy-MM-dd HH:00"
    );
  }

  return String(value || "").trim();
}  

/***************************************************************
 * JAVIS LOSS 웹앱
 ***************************************************************/

/**
 * 웹앱 시작 화면
 */
function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.api || "").trim().toLowerCase();

  if (!action) {
    return HtmlService
      .createTemplateFromFile("Index")
      .evaluate()
      .setTitle("JAVIS LOSS MONITOR")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag("viewport", "width=device-width, initial-scale=1, maximum-scale=1");
  }

  const callback = sanitizeJavisJsonpCallbackJWCHA_(params.callback);
  let payload;

  try {
    if (action === "ping") {
      payload = { ok: true, serverTime: new Date().toISOString() };
    } else if (action === "dashboard") {
      payload = { ok: true, data: getWebDashboardDataJWCHA(params.period || "month") };
    } else if (action === "management") {
      payload = { ok: true, data: getJavisManagementApiDataJWCHA_(params.period || "month") };
    } else if (action === "compensation") {
      payload = { ok: true, data: getJavisCompensationApiDataJWCHA_(params.period || "month") };
    } else if (action === "refresh") {
      const result = runWebFullRefreshJWCHA();
      payload = { ok: true, message: "전체 갱신 완료", result: result || null, data: getWebDashboardDataJWCHA(params.period || "month") };
    } else if (action === "ai") {
      const result = runBadStockAiAnalysisJWCHA();
      payload = { ok: true, message: "AI 분석 완료", result: result || null, data: getWebDashboardDataJWCHA(params.period || "month") };
    } else {
      throw new Error("지원하지 않는 API입니다: " + action);
    }
  } catch (error) {
    payload = { ok: false, message: String(error.message || error) };
  }

  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(payload) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function sanitizeJavisJsonpCallbackJWCHA_(value) {
  const callback = String(value || "javisLossCallback");
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)
    ? callback
    : "javisLossCallback";
}

function getJavisManagementApiDataJWCHA_(period) {
  const ss = SpreadsheetApp.openById(BAD_STOCK_CONFIG_JWCHA.TARGET_SS_ID);
  const sheet = ss.getSheetByName(BAD_STOCK_CONFIG_JWCHA.MANAGEMENT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 1) return { period: period, headers: [], rows: [], total: 0 };
  const values = sheet.getDataRange().getDisplayValues();
  const rows = values.slice(1).filter(function(row) {
    return row.some(function(cell) { return String(cell).trim() !== ""; });
  });
  return { period: period, headers: values[0] || [], rows: rows, total: rows.length };
}

function getJavisCompensationApiDataJWCHA_(period) {
  const dashboard = getWebDashboardDataJWCHA(period);
  const comp = dashboard.compensation || {};
  const products = comp.products || [];
  const headers = ["순위", "상품명", "상품코드", "FD", "FL", "총수량", "적용 판매가", "일반 변상금액", "감모율 0.1%", "차감 후 변상금액", "가격상태", "네이버 상품"];
  const rows = products.map(function(item, index) {
    return [
      index + 1,
      item.productName || item.name || "",
      item.productCode || "",
      item.fdQty || 0,
      item.flQty || 0,
      item.totalQty || item.quantity || 0,
      item.unitPrice || item.appliedPrice || 0,
      item.amount || item.normalAmount || 0,
      item.shrinkageAmount || 0,
      item.adjustedAmount || 0,
      item.priceStatus || item.status || "",
      item.matchedTitle || item.naverTitle || ""
    ];
  });
  return { period: period, headers: headers, rows: rows, summary: comp, total: rows.length };
}


/**
 * 웹앱에서 전체 데이터 갱신
 *
 * PREV/CUR 업데이트
 * → 신규 LOG 누적
 * → 시간/일/월 집계
 *
 * 스프레드시트 내부 DASHBOARD는 만들지 않는다.
 */
function runWebFullRefreshJWCHA() {
  const lock = LockService.getScriptLock();

  const properties =
    PropertiesService.getScriptProperties();

  let appendResult = {
    totalNewCount: 0,
    centerLossNewCount: 0,
    centerLossNewQty: 0
  };

  try {
    lock.waitLock(30000);

    setupBadStockMonitoringJWCHA();
    updateCurAndPrevFromLatestFilesJWCHA();

    appendResult =
      appendBadStockLogJWCHA() || appendResult;

    updateBadStockSummaryJWCHA();

    properties.setProperties({
      BAD_STOCK_LAST_AUTO_REFRESH_TIME:
        String(new Date().getTime()),

      BAD_STOCK_LAST_TRIGGER_STATUS:
        "SUCCESS",

      BAD_STOCK_LAST_REFRESH_TYPE:
        "WEB_FULL"
    });

    SpreadsheetApp.flush();

  } catch (error) {
    properties.setProperties({
      BAD_STOCK_LAST_TRIGGER_STATUS:
        "ERROR",

      BAD_STOCK_LAST_TRIGGER_ERROR:
        String(error.message || error),

      BAD_STOCK_LAST_TRIGGER_ERROR_TIME:
        String(new Date().getTime())
    });

    Logger.log(error.stack || error);

    return {
      ok: false,
      message: error.message
    };

  } finally {
    lock.releaseLock();
  }

  try {
    syncNaverMaxPricesFromBadStockLogJWCHA();

  } catch (priceError) {
    Logger.log(
      "네이버 가격 자동 조회 실패: " +
      priceError.message
    );
  }

  if (appendResult.centerLossNewCount > 0) {
    try {
      runBadStockAiAnalysisJWCHA();

    } catch (aiError) {
      Logger.log(
        "AI 자동 분석 실패: " +
        aiError.message
      );
    }
  }

  return {
    ok: true,

    message:
      "데이터 갱신 완료 / 신규 센터 LOSS " +
      appendResult.centerLossNewCount +
      "건",

    data: getWebDashboardDataJWCHA("month")
  };
}


/**
 * 웹 대시보드 데이터 반환
 *
 * period
 * - today
 * - 7d
 * - 30d
 * - month
 * - all
 */
function getWebDashboardBaseDataJWCHA(period) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  const ss = SpreadsheetApp.openById(
    config.TARGET_SS_ID
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  const requestedPeriod =
    String(period || "month").toLowerCase();

  const now = new Date();

  const todayText = Utilities.formatDate(
    now,
    config.TIMEZONE,
    "yyyy-MM-dd"
  );

  const currentMonth = Utilities.formatDate(
    now,
    config.TIMEZONE,
    "yyyy-MM"
  );

  const properties =
    PropertiesService.getScriptProperties();

  const lastAutoRefreshValue = Number(
    properties.getProperty(
      "BAD_STOCK_LAST_AUTO_REFRESH_TIME"
    )
  );

  const lastAutoRefresh = lastAutoRefreshValue
    ? formatWebDateTimeJWCHA(
        new Date(lastAutoRefreshValue)
      )
    : "";

  const emptyResult = {
    meta: {
      period: requestedPeriod,

      // 마지막 자동 확인시간
      lastRefresh: lastAutoRefresh,

      // 마지막 실제 LOSS 발생시간
      lastLossTime: "",

      totalRows: 0
    },

    kpi: {
      todayQty: 0,
      monthQty: 0,
      totalQty: 0,
      totalCount: 0,
      selectedQty: 0,
      selectedCount: 0,
      fdQty: 0,
      flQty: 0,
      crQty: 0
    },

    // 센터 귀책 LOSS 비율에는 FD와 FL만 제공
    zone: [
      {
        zone: "FD",
        label: "센터 파손",
        quantity: 0
      },
      {
        zone: "FL",
        label: "센터 분실",
        quantity: 0
      }
    ],

    hourly: [],
    daily: [],
    monthly: [],
    customers: [],
    products: [],
    recent: [],
    ai: getWebLatestAiAnalysisJWCHA()
  };

  if (!logSheet || logSheet.getLastRow() < 2) {
    return emptyResult;
  }

  const lastRow = logSheet.getLastRow();

  const rows = logSheet
    .getRange(
      2,
      1,
      lastRow - 1,
      22
    )
    .getValues();

  const startDateText =
    getWebPeriodStartDateJWCHA(
      requestedPeriod,
      now
    );

  const hourlyMap = {};
  const dailyMap = {};
  const monthlyMap = {};
  const customerMap = {};
  const productMap = {};

  const zoneMap = {
    FD: 0,
    FL: 0,
    CR: 0
  };

  // 아래 KPI는 센터 귀책인 FD + FL만 계산
  let todayQty = 0;
  let monthQty = 0;
  let totalQty = 0;
  let totalCount = 0;

  let selectedQty = 0;
  let selectedCount = 0;

  let lastRefreshDate = null;

  // 최근 발생내역은 CR까지 포함해 현황 확인용으로 유지
  const recentRows = [];

  rows.forEach(function(row) {
    const refreshTime = row[0];

    const occurrenceDate =
      normalizeDateTextJWCHA(row[1]);

    const occurrenceMonth =
      normalizeMonthTextJWCHA(row[2]);

    const occurrenceHour =
      normalizeHourTextJWCHA(row[3]);

    const zone =
      normalizeTextJWCHA(row[4]);

    const category =
      String(row[5] || "").trim();

    const customer =
      String(row[6] || "").trim();

    const productCode =
      String(row[7] || "").trim();

    const barcode =
      String(row[8] || "").trim();

    const productName =
      String(row[9] || "").trim();

    const lot =
      String(row[11] || "").trim();

    const location =
      String(row[14] || "").trim();

    const quantity =
      toNumberJWCHA(row[17]);

    if (
      !occurrenceDate ||
      !["FD", "FL", "CR"].includes(zone) ||
      quantity <= 0
    ) {
      return;
    }

    const isCenterLoss =
      zone === "FD" || zone === "FL";

    if (isCenterLoss) {
      totalCount++;
      totalQty += quantity;

      if (occurrenceDate === todayText) {
        todayQty += quantity;
      }

      if (occurrenceMonth === currentMonth) {
        monthQty += quantity;
      }
    }

    if (
      Object.prototype.toString.call(refreshTime) ===
        "[object Date]" &&
      !isNaN(refreshTime)
    ) {
      if (
        !lastRefreshDate ||
        refreshTime > lastRefreshDate
      ) {
        lastRefreshDate = refreshTime;
      }
    }

    if (
      !isWebRowInPeriodJWCHA(
        occurrenceDate,
        occurrenceMonth,
        requestedPeriod,
        startDateText,
        todayText,
        currentMonth
      )
    ) {
      return;
    }

    // CR은 참고 카드에서만 표시
    zoneMap[zone] =
      (zoneMap[zone] || 0) + quantity;

    const hourLabel =
      occurrenceHour.length >= 5
        ? occurrenceHour.slice(-5)
        : occurrenceHour;

    // 최근 발생내역은 CR 포함
    recentRows.push({
      refreshTime:
        formatWebDateTimeJWCHA(refreshTime),

      occurrenceDate: occurrenceDate,
      hour: hourLabel,
      zone: zone,
      category: category,
      customer: customer,
      productCode: productCode,
      barcode: barcode,
      productName: productName,
      lot: lot,
      location: location,
      quantity: quantity,

      sortTime:
        Object.prototype.toString.call(refreshTime) ===
          "[object Date]" &&
        !isNaN(refreshTime)
          ? refreshTime.getTime()
          : 0
    });

    // 아래부터는 센터 귀책(FD/FL)만 집계
    if (!isCenterLoss) {
      return;
    }

    selectedCount++;
    selectedQty += quantity;

    hourlyMap[hourLabel] =
      (hourlyMap[hourLabel] || 0) +
      quantity;

    if (!dailyMap[occurrenceDate]) {
      dailyMap[occurrenceDate] = {
        total: 0,
        FD: 0,
        FL: 0
      };
    }

    dailyMap[occurrenceDate].total += quantity;
    dailyMap[occurrenceDate][zone] += quantity;

    if (!monthlyMap[occurrenceMonth]) {
      monthlyMap[occurrenceMonth] = {
        total: 0,
        FD: 0,
        FL: 0
      };
    }

    monthlyMap[occurrenceMonth].total += quantity;
    monthlyMap[occurrenceMonth][zone] += quantity;

    if (customer) {
      customerMap[customer] =
        (customerMap[customer] || 0) +
        quantity;
    }

    const productKey =
      productName || productCode || barcode;

    if (productKey) {
      if (!productMap[productKey]) {
        productMap[productKey] = {
          name: productKey,
          code: productCode,
          quantity: 0
        };
      }

      productMap[productKey].quantity += quantity;
    }
  });

  const hourly = [];

  for (let hour = 0; hour < 24; hour++) {
    const hourLabel =
      String(hour).padStart(2, "0") + ":00";

    hourly.push({
      hour: hourLabel,
      quantity: hourlyMap[hourLabel] || 0
    });
  }

  const daily = Object.keys(dailyMap)
    .sort()
    .slice(-31)
    .map(function(date) {
      return {
        date: date,
        total: dailyMap[date].total,
        FD: dailyMap[date].FD,
        FL: dailyMap[date].FL
      };
    });

  const monthly = Object.keys(monthlyMap)
    .sort()
    .slice(-12)
    .map(function(month) {
      return {
        month: month,
        total: monthlyMap[month].total,
        FD: monthlyMap[month].FD,
        FL: monthlyMap[month].FL
      };
    });

  const customers = Object.keys(customerMap)
    .map(function(name) {
      return {
        name: name,
        quantity: customerMap[name]
      };
    })
    .sort(function(a, b) {
      return b.quantity - a.quantity;
    })
    .slice(0, 10);

  const products = Object.keys(productMap)
    .map(function(key) {
      return productMap[key];
    })
    .sort(function(a, b) {
      return b.quantity - a.quantity;
    })
    .slice(0, 10);

  const recent = recentRows
    .sort(function(a, b) {
      return b.sortTime - a.sortTime;
    })
    .slice(0, 50)
    .map(function(item) {
      delete item.sortTime;
      return item;
    });

  return {
    meta: {
      period: requestedPeriod,

      // 트리거 또는 전체 갱신 버튼이 마지막으로 확인한 시간
      lastRefresh: lastAutoRefresh,

      // 불용재고_LOG에 마지막으로 신규 발생한 시간
      lastLossTime: lastRefreshDate
        ? formatWebDateTimeJWCHA(lastRefreshDate)
        : "",

      // 센터 귀책 발생 건수
      totalRows: totalCount
    },

    kpi: {
      // 모두 FD + FL 기준
      todayQty: todayQty,
      monthQty: monthQty,
      totalQty: totalQty,
      totalCount: totalCount,
      selectedQty: selectedQty,
      selectedCount: selectedCount,

      // 선택 기간 기준 개별 현황
      fdQty: zoneMap.FD || 0,
      flQty: zoneMap.FL || 0,

      // CR은 참고용
      crQty: zoneMap.CR || 0
    },

    zone: [
      {
        zone: "FD",
        label: "센터 파손",
        quantity: zoneMap.FD || 0
      },
      {
        zone: "FL",
        label: "센터 분실",
        quantity: zoneMap.FL || 0
      }
    ],

    hourly: hourly,
    daily: daily,
    monthly: monthly,
    customers: customers,
    products: products,
    recent: recent,
    ai: getWebLatestAiAnalysisJWCHA()
  };
}


/**
 * 선택 기간의 시작일 계산
 */
function getWebPeriodStartDateJWCHA(
  period,
  now
) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  if (period === "7d") {
    const start = new Date(
      now.getTime() -
      6 * 24 * 60 * 60 * 1000
    );

    return Utilities.formatDate(
      start,
      config.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  if (period === "30d") {
    const start = new Date(
      now.getTime() -
      29 * 24 * 60 * 60 * 1000
    );

    return Utilities.formatDate(
      start,
      config.TIMEZONE,
      "yyyy-MM-dd"
    );
  }

  return "";
}


/**
 * 기간 필터 판정
 */
function isWebRowInPeriodJWCHA(
  occurrenceDate,
  occurrenceMonth,
  period,
  startDateText,
  todayText,
  currentMonth
) {
  switch (period) {
    case "today":
      return occurrenceDate === todayText;

    case "7d":
    case "30d":
      return (
        occurrenceDate >= startDateText &&
        occurrenceDate <= todayText
      );

    case "month":
      return occurrenceMonth === currentMonth;

    case "all":
      return true;

    default:
      return occurrenceMonth === currentMonth;
  }
}


/**
 * 날짜를 웹 전송용 문자열로 변환
 */
function formatWebDateTimeJWCHA(value) {
  if (
    Object.prototype.toString.call(value) ===
      "[object Date]" &&
    !isNaN(value)
  ) {
    return Utilities.formatDate(
      value,
      BAD_STOCK_CONFIG_JWCHA.TIMEZONE,
      "yyyy-MM-dd HH:mm:ss"
    );
  }

  return String(value || "");
}


/**
 * 최신 AI 분석 읽기
 */
function getWebLatestAiAnalysisJWCHA() {
  const properties =
    PropertiesService.getScriptProperties();

  const text =
    properties.getProperty(
      "BAD_STOCK_AI_LATEST_TEXT"
    ) || "";

  const timeValue = Number(
    properties.getProperty(
      "BAD_STOCK_AI_LATEST_TIME"
    )
  );

  return {
    text: text,

    time: timeValue
      ? Utilities.formatDate(
          new Date(timeValue),
          BAD_STOCK_CONFIG_JWCHA.TIMEZONE,
          "yyyy-MM-dd HH:mm:ss"
        )
      : ""
  };
}


/**
 * 웹에서 AI 분석 실행
 */
function runBadStockAiAnalysisWebJWCHA() {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const apiKey = getOpenAiApiKeyJWCHA();

  if (!apiKey) {
    return {
      ok: false,
      message:
        "OpenAI API 키가 없습니다. " +
        "스크립트 속성 OPENAI_API_KEY에 키를 저장하세요."
    };
  }

  const ss = SpreadsheetApp.openById(
    config.TARGET_SS_ID
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  if (!logSheet || logSheet.getLastRow() < 2) {
    return {
      ok: false,
      message: "AI가 분석할 불용재고 LOG가 없습니다."
    };
  }

  try {
    const summary =
      makeBadStockAiSummaryJWCHA(logSheet);

    const prompt = [
      "당신은 물류센터 센터 귀책 Loss 분석 보조자입니다.",
      "",
      "불용 구분:",
      "- CR: 고객사 품질 또는 고객사 귀책 파손",
      "- FD: 물류센터 파손",
      "- FL: 물류센터 분실",
      "",
      "아래 집계 데이터만 근거로 FD·FL 센터 귀책 중심으로 분석하세요.",
      "작업자나 직접 원인을 임의로 확정하지 마세요.",
      "",
      "다음 형식으로 작성하세요.",
      "1. 핵심 요약",
      "2. 가장 큰 Loss 유형",
      "3. 집중 발생 시간대",
      "4. 주요 고객사",
      "5. 반복 발생 상품",
      "6. 우선 확인 항목 3개",
      "7. 데이터 해석 시 주의사항",
      "",
      "현장 관리자가 빠르게 읽을 수 있도록",
      "짧고 명확한 한국어로 작성하세요.",
      "",
      JSON.stringify(summary, null, 2)
    ].join("\n");

    const response = UrlFetchApp.fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "post",
        contentType: "application/json",

        headers: {
          Authorization:
            "Bearer " + apiKey
        },

        payload: JSON.stringify({
          model: config.OPENAI_MODEL,
          input: prompt,
          max_output_tokens: 1200
        }),

        muteHttpExceptions: true
      }
    );

    const statusCode =
      response.getResponseCode();

    const responseText =
      response.getContentText();

    if (
      statusCode < 200 ||
      statusCode >= 300
    ) {
      return {
        ok: false,
        message:
          "OpenAI API 호출 실패 (" +
          statusCode +
          ")\n" +
          responseText
      };
    }

    const json =
      JSON.parse(responseText);

    const analysisText =
      extractOpenAiResponseTextJWCHA(json);

    if (!analysisText) {
      return {
        ok: false,
        message:
          "OpenAI 응답에서 분석 결과를 찾지 못했습니다."
      };
    }

    saveBadStockAiAnalysisJWCHA(
      ss,
      analysisText,
      summary
    );

    return {
      ok: true,
      message: "AI 분석 완료",
      analysis: {
        text: analysisText,
        time: Utilities.formatDate(
          new Date(),
          config.TIMEZONE,
          "yyyy-MM-dd HH:mm:ss"
        )
      }
    };

  } catch (error) {
    Logger.log(error.stack || error);

    return {
      ok: false,
      message: error.message
    };
  }
} 

/***************************************************************
 * 네이버 쇼핑 최고가 조회
 *
 * 대상:
 * - 불용재고_LOG E열 = FD 또는 FL
 * - 불용재고_LOG J열 = 상품명
 *
 * 결과:
 * - 판매가_DB 시트
 ***************************************************************/

const NAVER_PRICE_CONFIG_JWCHA = {
  DB_SHEET_NAME: "판매가_DB",

  CLIENT_ID_PROPERTY: "NAVER_SHOP_CLIENT_ID",
  CLIENT_SECRET_PROPERTY: "NAVER_SHOP_CLIENT_SECRET",

  API_URL: "https://openapi.naver.com/v1/search/shop.json",

  // 한 상품당 검색 결과
  DISPLAY: 100,

  // 한 번 실행할 최대 신규 상품 수
  // Apps Script 실행시간 초과 방지
  MAX_PRODUCTS_PER_RUN: 80,

  // 제목 매칭 최소 점수
  MIN_MATCH_SCORE: 0.75
};


/**
 * 네이버 Client ID / Client Secret 저장
 */
function setNaverShoppingApiKeysJWCHA() {
  const ui = SpreadsheetApp.getUi();

  const idResponse = ui.prompt(
    "네이버 쇼핑 API 설정",
    "네이버 개발자센터에서 발급받은 Client ID를 입력하세요.",
    ui.ButtonSet.OK_CANCEL
  );

  if (
    idResponse.getSelectedButton() !==
    ui.Button.OK
  ) {
    return;
  }

  const clientId = String(
    idResponse.getResponseText() || ""
  ).trim();

  if (!clientId) {
    ui.alert("Client ID가 입력되지 않았습니다.");
    return;
  }

  const secretResponse = ui.prompt(
    "네이버 쇼핑 API 설정",
    "Client Secret을 입력하세요.",
    ui.ButtonSet.OK_CANCEL
  );

  if (
    secretResponse.getSelectedButton() !==
    ui.Button.OK
  ) {
    return;
  }

  const clientSecret = String(
    secretResponse.getResponseText() || ""
  ).trim();

  if (!clientSecret) {
    ui.alert("Client Secret이 입력되지 않았습니다.");
    return;
  }

  PropertiesService
    .getScriptProperties()
    .setProperties({
      NAVER_SHOP_CLIENT_ID: clientId,
      NAVER_SHOP_CLIENT_SECRET: clientSecret
    });

  ui.alert(
    "네이버 쇼핑 API 정보가 Script Properties에 저장되었습니다."
  );
}


/**
 * API 키 조회
 */
function getNaverShoppingApiKeysJWCHA() {
  const properties =
    PropertiesService.getScriptProperties();

  return {
    clientId:
      properties.getProperty(
        NAVER_PRICE_CONFIG_JWCHA.CLIENT_ID_PROPERTY
      ) || "",

    clientSecret:
      properties.getProperty(
        NAVER_PRICE_CONFIG_JWCHA.CLIENT_SECRET_PROPERTY
      ) || ""
  };
}


/**
 * 판매가_DB 시트 생성
 */
function setupNaverPriceDbJWCHA() {
  const ss = SpreadsheetApp.openById(
    BAD_STOCK_CONFIG_JWCHA.TARGET_SS_ID
  );

  let sheet = ss.getSheetByName(
    NAVER_PRICE_CONFIG_JWCHA.DB_SHEET_NAME
  );

  if (!sheet) {
    sheet = ss.insertSheet(
      NAVER_PRICE_CONFIG_JWCHA.DB_SHEET_NAME
    );
  }

  const headers = [
    "상품명",
    "검색 상품명",
    "최고가",
    "최저가",
    "판매처",
    "브랜드",
    "제조사",
    "카테고리",
    "상품 URL",
    "네이버 상품ID",
    "매칭점수",
    "조회상태",
    "조회시간"
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1E293B")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  sheet.setFrozenRows(1);

  sheet.setColumnWidth(1, 350);
  sheet.setColumnWidth(2, 400);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);
  sheet.setColumnWidth(5, 160);
  sheet.setColumnWidth(6, 130);
  sheet.setColumnWidth(7, 130);
  sheet.setColumnWidth(8, 230);
  sheet.setColumnWidth(9, 300);
  sheet.setColumnWidth(12, 120);
  sheet.setColumnWidth(13, 150);

  sheet
    .getRange("C:D")
    .setNumberFormat('#,##0"원"');

  sheet
    .getRange("K:K")
    .setNumberFormat("0.00");

  sheet
    .getRange("M:M")
    .setNumberFormat("yyyy-mm-dd hh:mm:ss");

  return sheet;
}


/**
 * FD/FL 상품 중 판매가_DB에 없는 상품만 조회
 */
function syncNaverMaxPricesFromBadStockLogJWCHA() {
  return syncNaverMaxPricesInternalJWCHA(false);
}


/**
 * 기존 DB를 초기화하고 전체 재조회
 */
function refreshAllNaverMaxPricesJWCHA() {
  const ui = SpreadsheetApp.getUi();

  const answer = ui.alert(
    "전체 가격 재조회",
    "판매가_DB를 초기화하고 FD/FL 전체 상품을 다시 조회할까요?",
    ui.ButtonSet.YES_NO
  );

  if (answer !== ui.Button.YES) {
    return;
  }

  return syncNaverMaxPricesInternalJWCHA(true);
}


/**
 * 가격 조회 내부 실행
 */
function syncNaverMaxPricesInternalJWCHA(forceRefresh) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    const keys =
      getNaverShoppingApiKeysJWCHA();

    if (!keys.clientId || !keys.clientSecret) {
      throw new Error(
        "네이버 쇼핑 API 정보가 없습니다.\n" +
        "스프레드시트 메뉴에서 '네이버 API 키 저장'을 먼저 실행하세요."
      );
    }

    const ss = SpreadsheetApp.openById(
      BAD_STOCK_CONFIG_JWCHA.TARGET_SS_ID
    );

    const logSheet = ss.getSheetByName(
      BAD_STOCK_CONFIG_JWCHA.LOG_SHEET_NAME
    );

    if (
      !logSheet ||
      logSheet.getLastRow() < 2
    ) {
      throw new Error(
        "불용재고_LOG에 조회할 데이터가 없습니다."
      );
    }

    const dbSheet =
      setupNaverPriceDbJWCHA();

    if (forceRefresh) {
      const dbLastRow = dbSheet.getLastRow();

      if (dbLastRow > 1) {
        dbSheet
          .getRange(
            2,
            1,
            dbLastRow - 1,
            13
          )
          .clearContent();
      }
    }

    /*
     * 기존 판매가_DB 상품명 목록
     */
    const existingNames = new Set();

    if (
      !forceRefresh &&
      dbSheet.getLastRow() > 1
    ) {
      const dbNames = dbSheet
        .getRange(
          2,
          1,
          dbSheet.getLastRow() - 1,
          1
        )
        .getDisplayValues();

      dbNames.forEach(function(row) {
        const key =
          normalizeNaverProductNameJWCHA(row[0]);

        if (key) {
          existingNames.add(key);
        }
      });
    }

    /*
     * 불용재고_LOG
     *
     * E열 index 4 = ZONE
     * J열 index 9 = 상품명
     */
    const logRows = logSheet
      .getRange(
        2,
        1,
        logSheet.getLastRow() - 1,
        10
      )
      .getDisplayValues();

    const productMap = new Map();

    logRows.forEach(function(row) {
      const zone =
        String(row[4] || "")
          .trim()
          .toUpperCase();

      const productName =
        String(row[9] || "").trim();

      /*
       * FD / FL만 가격 조회
       * CR은 조회 대상 제외
       */
      if (
        zone !== "FD" &&
        zone !== "FL"
      ) {
        return;
      }

      if (!productName) {
        return;
      }

      const normalized =
        normalizeNaverProductNameJWCHA(
          productName
        );

      if (!normalized) {
        return;
      }

      if (existingNames.has(normalized)) {
        return;
      }

      if (!productMap.has(normalized)) {
        productMap.set(
          normalized,
          productName
        );
      }
    });

    const products = Array
      .from(productMap.values())
      .slice(
        0,
        NAVER_PRICE_CONFIG_JWCHA
          .MAX_PRODUCTS_PER_RUN
      );

    if (products.length < 1) {
      SpreadsheetApp.getActive().toast(
        "새로 조회할 FD/FL 상품이 없습니다.",
        "네이버 판매가",
        5
      );

      return {
        ok: true,
        searched: 0,
        success: 0,
        failed: 0
      };
    }

    const outputRows = [];

    let successCount = 0;
    let failedCount = 0;

    products.forEach(function(productName) {
      try {
        const result =
          searchNaverShoppingMaxPriceJWCHA(
            productName,
            keys.clientId,
            keys.clientSecret
          );

        outputRows.push([
          productName,
          result.matchedTitle,
          result.maxPrice,
          result.minPrice,
          result.mallName,
          result.brand,
          result.maker,
          result.category,
          result.link,
          result.productId,
          result.matchScore,
          result.status,
          new Date()
        ]);

        if (String(result.status || "").indexOf("정상") === 0) {
          successCount++;
        } else {
          failedCount++;
        }

      } catch (error) {
        outputRows.push([
          productName,
          "",
          0,
          0,
          "",
          "",
          "",
          "",
          "",
          "",
          0,
          "오류: " + error.message,
          new Date()
        ]);

        failedCount++;
      }

      /*
       * API 연속 호출 완화
       */
      Utilities.sleep(120);
    });

    if (outputRows.length > 0) {
      const startRow = Math.max(
        dbSheet.getLastRow() + 1,
        2
      );

      dbSheet
        .getRange(
          startRow,
          1,
          outputRows.length,
          outputRows[0].length
        )
        .setValues(outputRows);

      dbSheet
        .getRange(
          startRow,
          3,
          outputRows.length,
          2
        )
        .setNumberFormat('#,##0"원"');

      dbSheet
        .getRange(
          startRow,
          13,
          outputRows.length,
          1
        )
        .setNumberFormat(
          "yyyy-mm-dd hh:mm:ss"
        );
    }

    SpreadsheetApp.flush();

    SpreadsheetApp.getActive().toast(
      "조회 " +
      outputRows.length +
      "건 / 정상 " +
      successCount +
      "건 / 미매칭·오류 " +
      failedCount +
      "건",
      "네이버 최고가 조회 완료",
      8
    );

    return {
      ok: true,
      searched: outputRows.length,
      success: successCount,
      failed: failedCount
    };

  } finally {
    lock.releaseLock();
  }
}


/**
 * 상품명으로 네이버 쇼핑 검색 후
 * 제목이 유사한 상품 중 최고가 반환
 */
function searchNaverShoppingMaxPriceJWCHA(
  productName,
  clientId,
  clientSecret
) {
  const apiKey = getOpenAiApiKeyJWCHA();

  /*
   * 1. AI가 사람처럼 상품명을 해석해서 검색어를 여러 개 생성
   * 2. 네이버 쇼핑 후보를 수집
   * 3. AI가 원본과 같은 상품/호환범위/판매단위를 판별
   * 4. 동일상품 후보 중 최고가를 선택
   *
   * OpenAI 오류 시에는 기존 규칙 기반 방식으로 자동 대체
   */

  let searchQueries = [];

  try {
    if (apiKey) {
      searchQueries =
        buildNaverAiSearchQueriesJWCHA(
          productName,
          apiKey
        );
    }
  } catch (error) {
    Logger.log(
      "AI 검색어 생성 실패, 기본 검색어 사용: " +
      error.message
    );
  }

  if (!Array.isArray(searchQueries) ||
      searchQueries.length < 1) {
    searchQueries =
      buildNaverSearchQueriesJWCHA(productName);
  }

  const itemMap = new Map();
  const searchErrors = [];

  searchQueries.forEach(function(query) {
    try {
      const items =
        fetchNaverShoppingItemsJWCHA(
          query,
          clientId,
          clientSecret
        );

      items.forEach(function(item) {
        const uniqueKey =
          String(item.productId || "") ||
          String(item.link || "") ||
          stripNaverHtmlJWCHA(item.title);

        if (!itemMap.has(uniqueKey)) {
          itemMap.set(uniqueKey, {
            item: item,
            searchQuery: query
          });
        }
      });

      Utilities.sleep(80);

    } catch (error) {
      searchErrors.push(
        query + " : " + error.message
      );
    }
  });

  const itemEntries =
    Array.from(itemMap.values());

  if (itemEntries.length < 1) {
    const result =
      makeEmptyNaverPriceResultJWCHA(
        "검색결과 없음"
      );

    if (searchErrors.length > 0) {
      result.status =
        "검색 오류: " +
        searchErrors.join(" | ");
    }

    return result;
  }

  /*
   * 가격이 있는 후보만 AI에게 전달
   * 너무 많은 후보는 실행시간과 토큰 사용량을 늘리므로 최대 40개
   */
  const candidates = itemEntries
    .map(function(entry, index) {
      const item = entry.item;

      const highPrice =
        toNumberJWCHA(item.hprice);

      const lowPrice =
        toNumberJWCHA(item.lprice);

      const effectiveMaxPrice =
        highPrice > 0
          ? highPrice
          : lowPrice;

      return {
        originalIndex: index,
        title: stripNaverHtmlJWCHA(item.title),
        maxPrice: effectiveMaxPrice,
        minPrice: lowPrice,
        mallName: String(item.mallName || ""),
        brand: String(item.brand || ""),
        maker: String(item.maker || ""),
        category: [
          item.category1,
          item.category2,
          item.category3,
          item.category4
        ]
          .filter(Boolean)
          .join(" > "),
        link: String(item.link || ""),
        productId: String(item.productId || ""),
        searchQuery: entry.searchQuery
      };
    })
    .filter(function(item) {
      return item.maxPrice > 0;
    })
    .slice(0, 40)
    .map(function(item, index) {
      item.aiIndex = index + 1;
      return item;
    });

  if (candidates.length < 1) {
    return makeEmptyNaverPriceResultJWCHA(
      "가격정보 있는 상품 없음"
    );
  }

  let aiDecision = null;

  try {
    if (apiKey) {
      aiDecision =
        selectNaverCandidatesWithAiJWCHA(
          productName,
          candidates,
          apiKey
        );
    }
  } catch (error) {
    Logger.log(
      "AI 상품 판별 실패, 규칙 기반 판별로 전환: " +
      error.message
    );
  }

  /*
   * AI를 사용할 수 없거나 AI 응답이 비정상일 경우
   * 기존 규칙 기반 후보 판별로 안전하게 대체
   */
  if (
    !aiDecision ||
    !Array.isArray(aiDecision.selectedIndices)
  ) {
    return selectNaverCandidateFallbackJWCHA(
      productName,
      candidates
    );
  }

  const selectedSet = new Set(
    aiDecision.selectedIndices
      .map(function(value) {
        return Number(value);
      })
      .filter(function(value) {
        return Number.isFinite(value) && value >= 1;
      })
  );

  const matchedCandidates =
    candidates.filter(function(item) {
      return selectedSet.has(item.aiIndex);
    });

  if (matchedCandidates.length < 1) {
    const empty =
      makeEmptyNaverPriceResultJWCHA(
        aiDecision.reason
          ? "AI 미매칭: " + aiDecision.reason
          : "AI 동일상품 없음"
      );

    return empty;
  }

  /*
   * AI가 동일상품으로 인정한 후보 안에서 요청대로 최고가 선택
   */
  matchedCandidates.sort(function(a, b) {
    return b.maxPrice - a.maxPrice;
  });

  const selected = matchedCandidates[0];

  const confidence =
    Math.max(
      0,
      Math.min(
        1,
        Number(aiDecision.confidence) || 0
      )
    );

  const status =
    confidence >= 0.80
      ? "정상"
      : "검토 필요";

  return {
    matchedTitle: selected.title,
    maxPrice: selected.maxPrice,
    minPrice: selected.minPrice,
    mallName: selected.mallName,
    brand: selected.brand,
    maker: selected.maker,
    category: selected.category,
    link: selected.link,
    productId: selected.productId,
    matchScore:
      Math.round(confidence * 100) / 100,
    status: status
  };
}


/**
 * AI가 네이버 쇼핑 검색어를 유동적으로 생성
 */
function buildNaverAiSearchQueriesJWCHA(
  productName,
  apiKey
) {
  const fallback =
    buildNaverSearchQueriesJWCHA(productName);

  const prompt = [
    "당신은 한국 온라인 쇼핑 상품 검색 비서입니다.",
    "",
    "원본 상품명을 네이버 쇼핑에서 찾기 위한 검색어를 생성하세요.",
    "단순 특수문자 제거가 아니라 상품의 의미를 이해해서 작성하세요.",
    "",
    "규칙:",
    "1. 브랜드명 또는 고유 상품명은 반드시 유지",
    "2. 상품 종류를 명확히 포함",
    "3. 모델명, 호환기기, 용량, 중량 중 중요한 조건만 유지",
    "4. 색상, 홍보문구, 불필요한 수식어는 제거 가능",
    "5. 원본에 없는 브랜드나 상품 종류를 만들지 말 것",
    "6. 서로 다른 관점의 검색어를 2~4개 생성",
    "7. JSON만 반환",
    "",
    "반환 형식:",
    '{"queries":["검색어1","검색어2"]}',
    "",
    "원본 상품명:",
    productName
  ].join("\n");

  const result =
    callOpenAiJsonJWCHA(
      prompt,
      apiKey,
      350
    );

  const aiQueries =
    result &&
    Array.isArray(result.queries)
      ? result.queries
      : [];

  const merged =
    aiQueries
      .concat(fallback)
      .map(function(query) {
        return String(query || "")
          .replace(/\s+/g, " ")
          .trim();
      })
      .filter(Boolean);

  return merged.filter(
    function(query, index, array) {
      return array.indexOf(query) === index;
    }
  ).slice(0, 5);
}


/**
 * AI가 원본과 동일한 상품 후보를 판별
 */
function selectNaverCandidatesWithAiJWCHA(
  productName,
  candidates,
  apiKey
) {
  const compactCandidates =
    candidates.map(function(item) {
      return {
        index: item.aiIndex,
        title: item.title,
        price: item.maxPrice,
        mall: item.mallName,
        brand: item.brand,
        maker: item.maker,
        category: item.category
      };
    });

  const prompt = [
    "당신은 물류센터 변상금액 산정을 돕는 상품 매칭 비서입니다.",
    "",
    "원본 상품명과 네이버 쇼핑 후보를 비교해",
    "실질적으로 같은 판매상품으로 볼 수 있는 후보만 선택하세요.",
    "",
    "판단 원칙:",
    "1. 브랜드, 고유 상품명, 상품 종류를 우선 확인",
    "2. 모델명과 호환기기 범위가 원본 조건을 포함하면 같은 상품으로 볼 수 있음",
    "3. 원본이 여러 모델 호환 상품이면 후보도 해당 호환범위를 충분히 포함해야 함",
    "4. 중량, 용량, 규격이 명시된 경우 일치 여부를 확인",
    "5. 원본이 단품이면 대량 묶음, 세트, 10개/100개 상품은 제외",
    "6. 색상만 다른 경우는 같은 상품으로 허용 가능",
    "7. 상품 종류가 다르면 단어가 비슷해도 반드시 제외",
    "8. 확신이 없으면 선택하지 말 것",
    "9. 가격이 높다는 이유로 선택하지 말 것",
    "10. JSON만 반환",
    "",
    "반환 형식:",
    '{"selectedIndices":[2,5],"confidence":0.92,"reason":"판단 이유"}',
    "",
    "selectedIndices는 같은 상품으로 인정한 후보 번호 배열입니다.",
    "같은 상품이 없으면 빈 배열을 반환하세요.",
    "",
    "원본 상품명:",
    productName,
    "",
    "후보 목록:",
    JSON.stringify(compactCandidates)
  ].join("\n");

  const result =
    callOpenAiJsonJWCHA(
      prompt,
      apiKey,
      700
    );

  return {
    selectedIndices:
      result &&
      Array.isArray(result.selectedIndices)
        ? result.selectedIndices
        : [],

    confidence:
      result
        ? Number(result.confidence) || 0
        : 0,

    reason:
      result
        ? String(result.reason || "")
        : ""
  };
}


/**
 * OpenAI Responses API를 호출하고 JSON 객체 반환
 */
function callOpenAiJsonJWCHA(
  prompt,
  apiKey,
  maxOutputTokens
) {
  const response = UrlFetchApp.fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey
      },
      payload: JSON.stringify({
        model:
          BAD_STOCK_CONFIG_JWCHA.OPENAI_MODEL,
        input: prompt,
        max_output_tokens:
          maxOutputTokens || 500
      }),
      muteHttpExceptions: true
    }
  );

  const statusCode =
    response.getResponseCode();

  const responseText =
    response.getContentText();

  if (
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      "OpenAI HTTP " +
      statusCode +
      " / " +
      responseText
    );
  }

  const json = JSON.parse(responseText);

  const outputText =
    extractOpenAiResponseTextJWCHA(json);

  if (!outputText) {
    throw new Error(
      "OpenAI JSON 응답 문장이 없습니다."
    );
  }

  const cleaned =
    outputText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

  try {
    return JSON.parse(cleaned);

  } catch (error) {
    const firstBrace =
      cleaned.indexOf("{");

    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace >= 0 &&
      lastBrace > firstBrace
    ) {
      return JSON.parse(
        cleaned.substring(
          firstBrace,
          lastBrace + 1
        )
      );
    }

    throw new Error(
      "OpenAI 응답을 JSON으로 변환하지 못했습니다."
    );
  }
}


/**
 * OpenAI 장애 시 기존 규칙 기반 판별
 */
function selectNaverCandidateFallbackJWCHA(
  productName,
  candidates
) {
  const scored = [];

  candidates.forEach(function(item) {
    const validation =
      validateNaverProductCandidateJWCHA(
        productName,
        item.title
      );

    if (!validation.valid) {
      return;
    }

    const score =
      calculateNaverTitleMatchScoreJWCHA(
        productName,
        item.title
      );

    if (score < 0.55) {
      return;
    }

    scored.push({
      item: item,
      score: score
    });
  });

  if (scored.length < 1) {
    return makeEmptyNaverPriceResultJWCHA(
      "AI 및 규칙 기반 미매칭"
    );
  }

  const bestScore = Math.max.apply(
    null,
    scored.map(function(entry) {
      return entry.score;
    })
  );

  const accurate =
    scored.filter(function(entry) {
      return entry.score >= bestScore - 0.03;
    });

  accurate.sort(function(a, b) {
    return b.item.maxPrice - a.item.maxPrice;
  });

  const selected = accurate[0];

  return {
    matchedTitle: selected.item.title,
    maxPrice: selected.item.maxPrice,
    minPrice: selected.item.minPrice,
    mallName: selected.item.mallName,
    brand: selected.item.brand,
    maker: selected.item.maker,
    category: selected.item.category,
    link: selected.item.link,
    productId: selected.item.productId,
    matchScore:
      Math.round(selected.score * 100) / 100,
    status:
      selected.score >= 0.75
        ? "정상"
        : "검토 필요"
  };
}


/**
 * 네이버 쇼핑 API 한 번 호출
 */
function fetchNaverShoppingItemsJWCHA(
  query,
  clientId,
  clientSecret
) {
  const config =
    NAVER_PRICE_CONFIG_JWCHA;

  const cleanQuery =
    String(query || "").trim();

  if (!cleanQuery) {
    return [];
  }

  const url =
    config.API_URL +
    "?query=" +
    encodeURIComponent(cleanQuery) +
    "&display=" +
    config.DISPLAY +
    "&start=1" +
    "&sort=sim" +
    "&exclude=used:rental:cbshop";

  const response = UrlFetchApp.fetch(
    url,
    {
      method: "get",

      headers: {
        "X-Naver-Client-Id":
          clientId,

        "X-Naver-Client-Secret":
          clientSecret
      },

      muteHttpExceptions: true
    }
  );

  const responseCode =
    response.getResponseCode();

  const responseText =
    response.getContentText();

  if (
    responseCode < 200 ||
    responseCode >= 300
  ) {
    throw new Error(
      "HTTP " +
      responseCode +
      " / " +
      responseText
    );
  }

  const json =
    JSON.parse(responseText);

  return Array.isArray(json.items)
    ? json.items
    : [];
}


/**
 * 네이버 검색어 후보 생성
 */
function buildNaverSearchQueriesJWCHA(
  productName
) {
  const original =
    String(productName || "")
      .replace(/\s+/g, " ")
      .trim();

  const cleaned =
    original
      .replace(/[()[\]{}]/g, " ")
      .replace(/[\/\\|,;:_+*=~]/g, " ")
      .replace(/[-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const core =
    cleaned
      .split(/\s+/)
      .filter(function(token) {
        return (
          token.length >= 2 ||
          /[가-힣a-z]+\d+/i.test(token)
        );
      })
      .join(" ")
      .trim();

  const shortCore =
    cleaned
      .split(/\s+/)
      .filter(function(token) {
        return token.length >= 2;
      })
      .slice(0, 5)
      .join(" ");

  return [
    original,
    cleaned,
    core,
    shortCore
  ].filter(
    function(query, index, array) {
      return (
        query &&
        array.indexOf(query) === index
      );
    }
  );
}


/**
 * 빈 결과
 */
function makeEmptyNaverPriceResultJWCHA(
  status
) {
  return {
    matchedTitle: "",
    maxPrice: 0,
    minPrice: 0,
    mallName: "",
    brand: "",
    maker: "",
    category: "",
    link: "",
    productId: "",
    matchScore: 0,
    status: status
  };
}


/**
 * 상품명 매칭 점수
 *
 * 1.00: 완전 일치
 * 0.95: 한 제목이 다른 제목을 포함
 * 그 외: 단어 일치율
 */


/***************************************************************
 * 네이버 AI/규칙 보조 매칭 함수
 ***************************************************************/

function normalizeNaverProductNameForMatchJWCHA(
  value
) {
  return stripNaverHtmlJWCHA(value)
    .toLowerCase()
    .replace(
      /(프로|에어|미니)\s*(\d+)\s*(?:인치)?/g,
      "$1$2"
    )
    .replace(
      /(\d+)\s*[~\-]\s*(\d+)\s*세대/g,
      "$1 $2세대"
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[\/\\_,:;|+*&%$#@!?'"]/g, " ")
    .replace(/[–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function getFlexibleNaverTokensJWCHA(text) {
  const stopWords = new Set([
    "정품",
    "공식",
    "무료배송",
    "당일배송",
    "국내배송",
    "특가",
    "할인",
    "상품",
    "옵션",
    "선택",
    "호환",
    "전용",
    "그레이",
    "블랙",
    "화이트",
    "핑크",
    "케이스",
    "커버"
  ]);

  return String(text || "")
    .split(/\s+/)
    .map(function(token) {
      return token
        .replace(
          /[^가-힣a-z0-9]/gi,
          ""
        )
        .trim();
    })
    .filter(function(token) {
      return (
        token.length >= 2 &&
        !stopWords.has(token)
      );
    });
}


function areNaverTokensSimilarJWCHA(
  tokenA,
  tokenB
) {
  const a =
    String(tokenA || "")
      .toLowerCase();

  const b =
    String(tokenB || "")
      .toLowerCase();

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  if (
    a.length >= 3 &&
    b.length >= 3 &&
    (
      a.includes(b) ||
      b.includes(a)
    )
  ) {
    return true;
  }

  const compactA =
    a.replace(
      /인치|세대|아이패드/g,
      ""
    );

  const compactB =
    b.replace(
      /인치|세대|아이패드/g,
      ""
    );

  if (
    compactA.length >= 2 &&
    compactA === compactB
  ) {
    return true;
  }

  if (
    compactA.length >= 3 &&
    compactB.length >= 3 &&
    (
      compactA.includes(compactB) ||
      compactB.includes(compactA)
    )
  ) {
    return true;
  }

  return false;
}


function getNaverTokenWeightJWCHA(token) {
  const text =
    String(token || "")
      .toLowerCase();

  if (
    /[가-힣]{3,}/.test(text) &&
    !/세대$/.test(text)
  ) {
    return 2;
  }

  if (
    /(프로|에어|미니)\d+/.test(text)
  ) {
    return 1.8;
  }

  if (/^\d+세대$/.test(text)) {
    return 0.7;
  }

  if (/^\d+$/.test(text)) {
    return 0.3;
  }

  return 1;
}


function hasNaverModelOverlapJWCHA(
  source,
  target
) {
  const sourceModels =
    extractNaverModelTokensJWCHA(
      source
    );

  const targetModels =
    extractNaverModelTokensJWCHA(
      target
    );

  if (sourceModels.length < 1) {
    return false;
  }

  return sourceModels.some(
    function(sourceModel) {
      return targetModels.some(
        function(targetModel) {
          return areNaverTokensSimilarJWCHA(
            sourceModel,
            targetModel
          );
        }
      );
    }
  );
}


function extractNaverModelTokensJWCHA(text) {
  const normalized =
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "");

  const matches =
    normalized.match(
      /(?:아이패드)?(?:에어|프로|미니)\d*(?:인치)?/g
    );

  return matches || [];
}


function calculateNaverTitleMatchScoreJWCHA(
  sourceTitle,
  searchTitle
) {
  const source =
    normalizeNaverProductNameForMatchJWCHA(sourceTitle);

  const target =
    normalizeNaverProductNameForMatchJWCHA(searchTitle);

  if (!source || !target) {
    return 0;
  }

  if (source === target) {
    return 1;
  }

  if (
    target.includes(source) ||
    source.includes(target)
  ) {
    return 0.96;
  }

  const sourceTokens =
    getFlexibleNaverTokensJWCHA(source);

  const targetTokens =
    getFlexibleNaverTokensJWCHA(target);

  if (
    sourceTokens.length < 1 ||
    targetTokens.length < 1
  ) {
    return 0;
  }

  let matchedWeight = 0;
  let totalWeight = 0;

  sourceTokens.forEach(function(sourceToken) {
    const weight =
      getNaverTokenWeightJWCHA(sourceToken);

    totalWeight += weight;

    const matched =
      targetTokens.some(function(targetToken) {
        return areNaverTokensSimilarJWCHA(
          sourceToken,
          targetToken
        );
      });

    if (matched) {
      matchedWeight += weight;
    }
  });

  const sourceCoverage =
    totalWeight > 0
      ? matchedWeight / totalWeight
      : 0;

  let targetMatched = 0;

  targetTokens.forEach(function(targetToken) {
    const matched =
      sourceTokens.some(function(sourceToken) {
        return areNaverTokensSimilarJWCHA(
          sourceToken,
          targetToken
        );
      });

    if (matched) {
      targetMatched++;
    }
  });

  const targetCoverage =
    targetTokens.length > 0
      ? targetMatched / targetTokens.length
      : 0;

  /*
   * 상품명 첫 핵심어 일치 보정
   * 예: 멀탱글
   */
  const sourceMainToken =
    sourceTokens.find(function(token) {
      return (
        token.length >= 3 &&
        !/^\d/.test(token)
      );
    }) || "";

  const mainTokenMatched =
    sourceMainToken &&
    targetTokens.some(function(token) {
      return areNaverTokensSimilarJWCHA(
        sourceMainToken,
        token
      );
    });

  /*
   * 모델명 일치 보정
   * 프로11 ↔ 프로11인치
   * 에어 ↔ 아이패드에어
   */
  const modelMatched =
    hasNaverModelOverlapJWCHA(
      source,
      target
    );

  let score =
    sourceCoverage * 0.72 +
    targetCoverage * 0.18;

  if (mainTokenMatched) {
    score += 0.06;
  }

  if (modelMatched) {
    score += 0.08;
  }

  return Math.min(
    1,
    Math.round(score * 100) / 100
  );
}


/**
 * 상품명 정규화
 */
function normalizeNaverProductNameJWCHA(
  value
) {
  return stripNaverHtmlJWCHA(value)
    .toLowerCase()
    .replace(/&nbsp;/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[\/_,.:;|+*&%$#@!?'"]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * 비교용 단어
 */
function getNaverProductTokensJWCHA(
  normalizedText
) {
  const stopWords = new Set([
    "정품",
    "공식",
    "무료배송",
    "당일배송",
    "국내배송",
    "특가",
    "할인",
    "상품",
    "옵션",
    "선택"
  ]);

  return String(normalizedText || "")
    .split(/\s+/)
    .map(function(token) {
      return token.trim();
    })
    .filter(function(token) {
      return (
        token.length >= 2 &&
        !stopWords.has(token)
      );
    });
}


/**
 * 네이버 제목의 <b> 태그 등 제거
 */
function stripNaverHtmlJWCHA(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function validateNaverProductCandidateJWCHA(
  sourceTitle,
  candidateTitle
) {
  const source =
    normalizeNaverProductNameJWCHA(
      sourceTitle
    );

  const candidate =
    normalizeNaverProductNameJWCHA(
      candidateTitle
    );

  if (!source || !candidate) {
    return {
      valid: false,
      reason: "상품명 없음"
    };
  }

  /*
   * 원본과 후보의 중량·용량 비교
   */
  const sourceUnits =
    extractProductUnitsJWCHA(source);

  const candidateUnits =
    extractProductUnitsJWCHA(candidate);

  if (
    sourceUnits.length > 0 &&
    candidateUnits.length > 0
  ) {
    const unitMatched =
      sourceUnits.some(function(sourceUnit) {
        return candidateUnits.includes(
          sourceUnit
        );
      });

    if (!unitMatched) {
      return {
        valid: false,
        reason: "중량·용량 불일치"
      };
    }
  }

  /*
   * 원본이 단품인데 후보가 대량상품인 경우 제외
   */
  const sourcePackCount =
    extractPackCountJWCHA(source);

  const candidatePackCount =
    extractPackCountJWCHA(candidate);

  if (
    sourcePackCount <= 1 &&
    candidatePackCount >= 2
  ) {
    return {
      valid: false,
      reason: "묶음수량 불일치"
    };
  }

  /*
   * 명시적인 묶음 표현 검사
   */
  const bulkWords = [
    "박스",
    "box",
    "세트",
    "set",
    "묶음",
    "대용량",
    "업소용",
    "벌크"
  ];

  const sourceHasBulk =
    bulkWords.some(function(word) {
      return source.includes(word);
    });

  const candidateHasBulk =
    bulkWords.some(function(word) {
      return candidate.includes(word);
    });

  if (
    !sourceHasBulk &&
    candidateHasBulk
  ) {
    return {
      valid: false,
      reason: "대량·세트 상품"
    };
  }

  /*
   * 후보명이 너무 길면 옵션이 많이 붙은 상품일 수 있음
   */
  if (
    candidate.length >
    source.length * 2.2
  ) {
    return {
      valid: false,
      reason: "상품명 과다 확장"
    };
  }

  return {
    valid: true,
    reason: ""
  };
}

function extractProductUnitsJWCHA(text) {
  const normalized =
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "");

  const matches = normalized.match(
    /\d+(?:\.\d+)?(?:kg|g|mg|l|ml|개입|매입|포입)/g
  );

  return matches || [];
}


function extractPackCountJWCHA(text) {
  const normalized =
    String(text || "")
      .toLowerCase()
      .replace(/\s+/g, "");

  const patterns = [
    /(\d+)개(?:입)?/,
    /(\d+)팩/,
    /(\d+)봉/,
    /(\d+)박스/,
    /(\d+)세트/,
    /x(\d+)/,
    /(\d+)ea/
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match =
      normalized.match(patterns[i]);

    if (match) {
      return Number(match[1]) || 1;
    }
  }

  return 1;
}


/***************************************************************
 * 변상금액 웹 탭 데이터
 * - 불용재고_LOG E열 FD/FL만
 * - J열 상품명을 판매가_DB A열과 매칭
 * - 판매가_DB C열 최고가 × 발생수량
 ***************************************************************/

/**
 * 기존 LOSS 데이터를 만들고 변상금액 데이터를 추가한다.
 */

/***************************************************************
 * LOSS 운영관리
 *
 * 기능
 * - 반복 발생 상품/고객사 경고
 * - 변상가격 기준 및 최종 변상금액 관리
 * - 원인 분류
 * - 처리 상태/담당자/조치내용 관리
 * - 선택 기간 자동 보고문 생성
 ***************************************************************/

function setupLossManagementSheetJWCHA(optionalSs) {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = optionalSs || SpreadsheetApp.openById(config.TARGET_SS_ID);

  let sheet = ss.getSheetByName(config.MANAGEMENT_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(config.MANAGEMENT_SHEET_NAME);
  }

  const headers = [
    "관리키",
    "발생시간",
    "ZONE",
    "고객사",
    "상품코드",
    "상품명",
    "발생수량",
    "원인분류",
    "처리상태",
    "담당자",
    "조치내용",
    "가격기준",
    "수동확정단가",
    "변상협의금액",
    "감모율0.1%적용",
    "최종변상금액",
    "수정시간"
  ];

  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#1E293B")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(6, 320);
  sheet.setColumnWidth(8, 150);
  sheet.setColumnWidth(9, 130);
  sheet.setColumnWidth(10, 120);
  sheet.setColumnWidth(11, 320);
  sheet.setColumnWidth(12, 140);
  sheet.setColumnWidth(17, 150);

  sheet.getRange("B:B").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange("M:P").setNumberFormat('#,##0"원"');
  sheet.getRange("Q:Q").setNumberFormat("yyyy-mm-dd hh:mm:ss");

  return sheet;
}


function getLossManagementMapJWCHA(ss) {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const map = new Map();

  const sheet = ss.getSheetByName(config.MANAGEMENT_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return map;

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 17)
    .getValues();

  values.forEach(function(row) {
    const key = String(row[0] || "").trim();
    if (!key) return;

    map.set(key, {
      key: key,
      occurrenceTime: row[1],
      zone: String(row[2] || ""),
      customer: String(row[3] || ""),
      productCode: String(row[4] || ""),
      productName: String(row[5] || ""),
      quantity: toNumberJWCHA(row[6]),
      cause: String(row[7] || "원인 미확인"),
      status: String(row[8] || "확인 전"),
      assignee: String(row[9] || ""),
      actionNote: String(row[10] || ""),
      priceType: String(row[11] || "자동조회가"),
      manualUnitPrice: toNumberJWCHA(row[12]),
      agreedAmount: toNumberJWCHA(row[13]),
      shrinkageApplied: row[14] === true || String(row[14]).toUpperCase() === "TRUE",
      finalAmount: toNumberJWCHA(row[15]),
      updatedTime: row[16]
    });
  });

  return map;
}


function normalizeLossManagementPayloadJWCHA(payload) {
  const causeOptions = [
    "피킹",
    "보충",
    "검수",
    "포장",
    "재고 이동",
    "파손 방치",
    "전산 오처리",
    "원인 미확인"
  ];

  const statusOptions = [
    "확인 전",
    "조사 중",
    "조치 완료",
    "배상 협의 중",
    "종결"
  ];

  const priceOptions = [
    "자동조회가",
    "수동확정가",
    "변상협의가",
    "무상감모"
  ];

  const cause = causeOptions.includes(String(payload.cause || ""))
    ? String(payload.cause)
    : "원인 미확인";

  const status = statusOptions.includes(String(payload.status || ""))
    ? String(payload.status)
    : "확인 전";

  const priceType = priceOptions.includes(String(payload.priceType || ""))
    ? String(payload.priceType)
    : "자동조회가";

  return {
    key: String(payload.key || "").trim(),
    occurrenceTime: payload.occurrenceTime ? new Date(payload.occurrenceTime) : "",
    zone: normalizeTextJWCHA(payload.zone),
    customer: String(payload.customer || "").trim(),
    productCode: String(payload.productCode || "").trim(),
    productName: String(payload.productName || "").trim(),
    quantity: Math.max(0, toNumberJWCHA(payload.quantity)),
    cause: cause,
    status: status,
    assignee: String(payload.assignee || "").trim().substring(0, 50),
    actionNote: String(payload.actionNote || "").trim().substring(0, 1000),
    priceType: priceType,
    manualUnitPrice: Math.max(0, toNumberJWCHA(payload.manualUnitPrice)),
    agreedAmount: Math.max(0, toNumberJWCHA(payload.agreedAmount)),
    shrinkageApplied: payload.shrinkageApplied === true ||
      String(payload.shrinkageApplied).toUpperCase() === "TRUE",
    autoUnitPrice: Math.max(0, toNumberJWCHA(payload.autoUnitPrice))
  };
}


function calculateManagedCompensationJWCHA(item) {
  const shrinkageRate = 0.001;

  let appliedUnitPrice = item.autoUnitPrice;
  let baseAmount = item.quantity * appliedUnitPrice;

  if (item.priceType === "수동확정가") {
    appliedUnitPrice = item.manualUnitPrice;
    baseAmount = item.quantity * appliedUnitPrice;
  } else if (item.priceType === "변상협의가") {
    appliedUnitPrice = 0;
    baseAmount = item.agreedAmount;
  } else if (item.priceType === "무상감모") {
    appliedUnitPrice = 0;
    baseAmount = 0;
  }

  const shrinkageAmount =
    item.shrinkageApplied &&
    item.priceType !== "무상감모" &&
    item.priceType !== "변상협의가"
      ? Math.round(baseAmount * shrinkageRate)
      : 0;

  return {
    appliedUnitPrice: appliedUnitPrice,
    baseAmount: baseAmount,
    shrinkageAmount: shrinkageAmount,
    finalAmount: Math.max(0, baseAmount - shrinkageAmount)
  };
}


function saveLossManagementJWCHA(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("저장할 관리정보가 없습니다.");
  }

  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);
  const sheet = setupLossManagementSheetJWCHA(ss);
  const item = normalizeLossManagementPayloadJWCHA(payload);

  if (!item.key) {
    throw new Error("관리키가 없어 저장할 수 없습니다.");
  }

  const calculated = calculateManagedCompensationJWCHA(item);
  const now = new Date();

  const rowValues = [[
    item.key,
    item.occurrenceTime,
    item.zone,
    item.customer,
    item.productCode,
    item.productName,
    item.quantity,
    item.cause,
    item.status,
    item.assignee,
    item.actionNote,
    item.priceType,
    item.manualUnitPrice,
    item.agreedAmount,
    item.shrinkageApplied,
    calculated.finalAmount,
    now
  ]];

  let targetRow = 0;

  if (sheet.getLastRow() >= 2) {
    const keys = sheet
      .getRange(2, 1, sheet.getLastRow() - 1, 1)
      .getDisplayValues();

    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][0] || "").trim() === item.key) {
        targetRow = i + 2;
        break;
      }
    }
  }

  if (!targetRow) {
    targetRow = Math.max(2, sheet.getLastRow() + 1);
  }

  sheet
    .getRange(targetRow, 1, 1, rowValues[0].length)
    .setValues(rowValues);

  sheet.getRange(targetRow, 2).setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange(targetRow, 13, 1, 4).setNumberFormat('#,##0"원"');
  sheet.getRange(targetRow, 17).setNumberFormat("yyyy-mm-dd hh:mm:ss");

  SpreadsheetApp.flush();

  return {
    ok: true,
    message: "운영관리 정보가 저장되었습니다.",
    calculated: calculated
  };
}


function buildManagementDashboardDataJWCHA(period) {
  const config = BAD_STOCK_CONFIG_JWCHA;
  const ss = SpreadsheetApp.openById(config.TARGET_SS_ID);
  const logSheet = ss.getSheetByName(config.LOG_SHEET_NAME);
  const managementMap = getLossManagementMapJWCHA(ss);
  const priceMap = getNaverPriceMapJWCHA(ss);

  const requestedPeriod = String(period || "month").toLowerCase();
  const now = new Date();
  const todayText = Utilities.formatDate(now, config.TIMEZONE, "yyyy-MM-dd");
  const currentMonth = Utilities.formatDate(now, config.TIMEZONE, "yyyy-MM");
  const startDateText = getWebPeriodStartDateJWCHA(requestedPeriod, now);

  const empty = {
    repeatProducts: [],
    repeatCustomers: [],
    cases: [],
    statusSummary: {
      total: 0,
      unchecked: 0,
      investigating: 0,
      actionComplete: 0,
      negotiating: 0,
      closed: 0
    },
    grossAutoAmount: 0,
    finalManagedAmount: 0,
    shrinkageSavedAmount: 0,
    reportText: "선택 기간에 센터 귀책 LOSS가 없습니다."
  };

  if (!logSheet || logSheet.getLastRow() < 2) return empty;

  const rows = logSheet
    .getRange(2, 1, logSheet.getLastRow() - 1, 22)
    .getValues();

  const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const sevenText = Utilities.formatDate(sevenDaysAgo, config.TIMEZONE, "yyyy-MM-dd");
  const thirtyText = Utilities.formatDate(thirtyDaysAgo, config.TIMEZONE, "yyyy-MM-dd");

  const repeatProductMap = {};
  const repeatCustomerMap = {};
  const cases = [];

  let grossAutoAmount = 0;
  let finalManagedAmount = 0;
  let selectedQty = 0;
  let fdQty = 0;
  let flQty = 0;

  rows.forEach(function(row) {
    const occurrenceDate = normalizeDateTextJWCHA(row[1]);
    const occurrenceMonth = normalizeMonthTextJWCHA(row[2]);
    const zone = normalizeTextJWCHA(row[4]);
    const customer = String(row[6] || "").trim();
    const productCode = String(row[7] || "").trim();
    const productName = String(row[9] || "").trim();
    const quantity = toNumberJWCHA(row[17]);
    const key = String(row[21] || "").trim();
    const refreshTime = row[0];

    if (!occurrenceDate || !["FD", "FL"].includes(zone) || quantity <= 0) return;

    if (occurrenceDate >= sevenText) {
      const productKey = normalizeNaverProductNameJWCHA(productName || productCode);
      if (productKey) {
        if (!repeatProductMap[productKey]) {
          repeatProductMap[productKey] = {
            name: productName || productCode,
            count: 0,
            quantity: 0,
            lastDate: occurrenceDate
          };
        }
        repeatProductMap[productKey].count++;
        repeatProductMap[productKey].quantity += quantity;
        if (occurrenceDate > repeatProductMap[productKey].lastDate) {
          repeatProductMap[productKey].lastDate = occurrenceDate;
        }
      }
    }

    if (occurrenceDate >= thirtyText && customer) {
      if (!repeatCustomerMap[customer]) {
        repeatCustomerMap[customer] = {
          name: customer,
          count: 0,
          quantity: 0,
          lastDate: occurrenceDate
        };
      }
      repeatCustomerMap[customer].count++;
      repeatCustomerMap[customer].quantity += quantity;
      if (occurrenceDate > repeatCustomerMap[customer].lastDate) {
        repeatCustomerMap[customer].lastDate = occurrenceDate;
      }
    }

    if (!isWebRowInPeriodJWCHA(
      occurrenceDate,
      occurrenceMonth,
      requestedPeriod,
      startDateText,
      todayText,
      currentMonth
    )) return;

    const normalizedName = normalizeNaverProductNameJWCHA(productName);
    const priceInfo = priceMap.get(normalizedName);
    const autoUnitPrice =
      priceInfo && priceInfo.status === "정상"
        ? toNumberJWCHA(priceInfo.maxPrice)
        : 0;

    const saved = managementMap.get(key) || {};
    const managedInput = {
      quantity: quantity,
      autoUnitPrice: autoUnitPrice,
      priceType: saved.priceType || "자동조회가",
      manualUnitPrice: saved.manualUnitPrice || 0,
      agreedAmount: saved.agreedAmount || 0,
      shrinkageApplied: saved.shrinkageApplied === true
    };

    const calculated = calculateManagedCompensationJWCHA(managedInput);
    const autoAmount = quantity * autoUnitPrice;

    grossAutoAmount += autoAmount;
    finalManagedAmount += calculated.finalAmount;
    selectedQty += quantity;
    if (zone === "FD") fdQty += quantity;
    if (zone === "FL") flQty += quantity;

    cases.push({
      key: key,
      refreshTime: formatWebDateTimeJWCHA(refreshTime),
      occurrenceDate: occurrenceDate,
      zone: zone,
      customer: customer,
      productCode: productCode,
      productName: productName,
      quantity: quantity,
      autoUnitPrice: autoUnitPrice,
      grossAmount: autoAmount,
      shrinkageAmount: Math.round(autoAmount * 0.001),
      adjustedAmount: Math.max(0, autoAmount - Math.round(autoAmount * 0.001)),
      cause: saved.cause || "원인 미확인",
      status: saved.status || "확인 전",
      assignee: saved.assignee || "",
      actionNote: saved.actionNote || "",
      priceType: saved.priceType || "자동조회가",
      manualUnitPrice: saved.manualUnitPrice || 0,
      agreedAmount: saved.agreedAmount || 0,
      shrinkageApplied: saved.shrinkageApplied === true,
      appliedUnitPrice: calculated.appliedUnitPrice,
      finalAmount: calculated.finalAmount,
      updatedTime: saved.updatedTime
        ? formatWebDateTimeJWCHA(saved.updatedTime)
        : ""
    });
  });

  cases.sort(function(a, b) {
    return String(b.refreshTime).localeCompare(String(a.refreshTime));
  });

  const repeatProducts = Object.keys(repeatProductMap)
    .map(function(key) { return repeatProductMap[key]; })
    .filter(function(item) { return item.count >= 3; })
    .sort(function(a, b) {
      return b.count - a.count || b.quantity - a.quantity;
    })
    .slice(0, 10);

  const repeatCustomers = Object.keys(repeatCustomerMap)
    .map(function(key) { return repeatCustomerMap[key]; })
    .filter(function(item) { return item.count >= 3; })
    .sort(function(a, b) {
      return b.count - a.count || b.quantity - a.quantity;
    })
    .slice(0, 10);

  const statusSummary = {
    total: cases.length,
    unchecked: 0,
    investigating: 0,
    actionComplete: 0,
    negotiating: 0,
    closed: 0
  };

  cases.forEach(function(item) {
    switch (item.status) {
      case "조사 중":
        statusSummary.investigating++;
        break;
      case "조치 완료":
        statusSummary.actionComplete++;
        break;
      case "배상 협의 중":
        statusSummary.negotiating++;
        break;
      case "종결":
        statusSummary.closed++;
        break;
      default:
        statusSummary.unchecked++;
    }
  });

  const topProduct = repeatProducts[0] || null;
  const topCustomer = repeatCustomers[0] || null;
  const periodLabel = {
    today: "오늘",
    "7d": "최근 7일",
    "30d": "최근 30일",
    month: "이번 달",
    all: "전체"
  }[requestedPeriod] || "이번 달";

  const reportLines = [
    "[" + periodLabel + " 센터 귀책 LOSS 보고]",
    "",
    "1. 발생 현황",
    "- 총 " + cases.length + "건 / " + selectedQty + "EA",
    "- FD 센터 파손 " + fdQty + "EA / FL 센터 분실 " + flQty + "EA",
    "",
    "2. 변상금액",
    "- 네이버 자동조회 기준 " + grossAutoAmount.toLocaleString("ko-KR") + "원",
    "- 관리 확정 기준 " + finalManagedAmount.toLocaleString("ko-KR") + "원",
    "- 감모·협의·무상 반영 차이 " +
      Math.max(0, grossAutoAmount - finalManagedAmount).toLocaleString("ko-KR") + "원",
    "",
    "3. 반복 발생",
    topProduct
      ? "- 상품: " + topProduct.name + " / 최근 7일 " + topProduct.count + "건, " + topProduct.quantity + "EA"
      : "- 최근 7일 3회 이상 반복 상품 없음",
    topCustomer
      ? "- 고객사: " + topCustomer.name + " / 최근 30일 " + topCustomer.count + "건, " + topCustomer.quantity + "EA"
      : "- 최근 30일 3회 이상 반복 고객사 없음",
    "",
    "4. 조치 상태",
    "- 확인 전 " + statusSummary.unchecked + "건 / 조사 중 " + statusSummary.investigating +
      "건 / 조치 완료 " + statusSummary.actionComplete + "건",
    "- 배상 협의 중 " + statusSummary.negotiating + "건 / 종결 " + statusSummary.closed + "건",
    "",
    "※ CR 고객사 품질·귀책 건은 센터 LOSS 및 변상금액에서 제외했습니다."
  ];

  return {
    repeatProducts: repeatProducts,
    repeatCustomers: repeatCustomers,
    cases: cases.slice(0, 50),
    statusSummary: statusSummary,
    grossAutoAmount: grossAutoAmount,
    finalManagedAmount: finalManagedAmount,
    shrinkageSavedAmount: Math.max(0, grossAutoAmount - finalManagedAmount),
    reportText: reportLines.join("\n")
  };
}


function createMonthlyLossReportJWCHA() {
  const data = buildManagementDashboardDataJWCHA("month");
  const ss = SpreadsheetApp.openById(BAD_STOCK_CONFIG_JWCHA.TARGET_SS_ID);

  let sheet = ss.getSheetByName("LOSS_보고문");
  if (!sheet) sheet = ss.insertSheet("LOSS_보고문");

  sheet.clear();
  sheet.setHiddenGridlines(true);
  sheet.getRange("A1:F2")
    .merge()
    .setValue("JAVIS LOSS 월간 보고문")
    .setFontSize(20)
    .setFontWeight("bold")
    .setFontColor("#FFFFFF")
    .setBackground("#101827");

  sheet.getRange("A4:F25")
    .merge()
    .setValue(data.reportText)
    .setWrap(true)
    .setVerticalAlignment("top")
    .setFontSize(12)
    .setBackground("#F8FAFC");

  sheet.setColumnWidths(1, 6, 150);

  SpreadsheetApp.getActive().toast(
    "LOSS_보고문 시트에 이번 달 보고문을 생성했습니다.",
    "JAVIS LOSS",
    5
  );
}


function getWebDashboardDataJWCHA(period) {
  const baseData = getWebDashboardBaseDataJWCHA(period);

  baseData.compensation =
    buildCompensationDashboardDataJWCHA(period);

  baseData.management =
    buildManagementDashboardDataJWCHA(period);

  return baseData;
}


/**
 * 판매가_DB의 정상 가격을 상품명 기준으로 읽는다.
 */
function getNaverPriceMapJWCHA(ss) {
  const result = new Map();

  const sheet = ss.getSheetByName(
    NAVER_PRICE_CONFIG_JWCHA.DB_SHEET_NAME
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return result;
  }

  const rows = sheet
    .getRange(
      2,
      1,
      sheet.getLastRow() - 1,
      13
    )
    .getValues();

  rows.forEach(function(row) {
    const originalName =
      String(row[0] || "").trim();

    const normalizedName =
      normalizeNaverProductNameJWCHA(
        originalName
      );

    const maxPrice =
      toNumberJWCHA(row[2]);

    const status =
      String(row[11] || "").trim();

    if (
      !normalizedName ||
      status !== "정상" ||
      maxPrice <= 0
    ) {
      return;
    }

    result.set(normalizedName, {
      originalName: originalName,
      matchedTitle:
        String(row[1] || "").trim(),
      maxPrice: maxPrice,
      minPrice: toNumberJWCHA(row[3]),
      mallName:
        String(row[4] || "").trim(),
      brand:
        String(row[5] || "").trim(),
      maker:
        String(row[6] || "").trim(),
      category:
        String(row[7] || "").trim(),
      link:
        String(row[8] || "").trim(),
      productId:
        String(row[9] || "").trim(),
      matchScore:
        Number(row[10]) || 0,
      status: status
    });
  });

  return result;
}


/**
 * 선택 기간의 상품별 판매가와 변상금액 집계
 */
function buildCompensationDashboardDataJWCHA(
  period
) {
  const config = BAD_STOCK_CONFIG_JWCHA;

  const ss = SpreadsheetApp.openById(
    config.TARGET_SS_ID
  );

  const logSheet = ss.getSheetByName(
    config.LOG_SHEET_NAME
  );

  const shrinkageRate = 0.001;

  const emptyResult = {
    shrinkageRate: shrinkageRate,
    selectedAmount: 0,
    selectedShrinkageAmount: 0,
    selectedAdjustedAmount: 0,
    todayAmount: 0,
    todayShrinkageAmount: 0,
    todayAdjustedAmount: 0,
    monthAmount: 0,
    monthShrinkageAmount: 0,
    monthAdjustedAmount: 0,
    totalAmount: 0,
    totalShrinkageAmount: 0,
    totalAdjustedAmount: 0,

    fdAmount: 0,
    fdShrinkageAmount: 0,
    fdAdjustedAmount: 0,
    flAmount: 0,
    flShrinkageAmount: 0,
    flAdjustedAmount: 0,

    averageUnitPrice: 0,
    highestUnitPrice: 0,

    matchedQty: 0,
    unmatchedQty: 0,
    matchedProductCount: 0,
    unmatchedProductCount: 0,

    products: [],
    customers: [],
    daily: [],
    monthly: [],

    zone: [
      {
        zone: "FD",
        label: "센터 파손",
        amount: 0
      },
      {
        zone: "FL",
        label: "센터 분실",
        amount: 0
      }
    ],

    unmatchedProducts: []
  };

  if (
    !logSheet ||
    logSheet.getLastRow() < 2
  ) {
    return emptyResult;
  }

  const requestedPeriod =
    String(period || "month")
      .toLowerCase();

  const now = new Date();

  const todayText =
    Utilities.formatDate(
      now,
      config.TIMEZONE,
      "yyyy-MM-dd"
    );

  const currentMonth =
    Utilities.formatDate(
      now,
      config.TIMEZONE,
      "yyyy-MM"
    );

  const startDateText =
    getWebPeriodStartDateJWCHA(
      requestedPeriod,
      now
    );

  const priceMap =
    getNaverPriceMapJWCHA(ss);

  const rows = logSheet
    .getRange(
      2,
      1,
      logSheet.getLastRow() - 1,
      22
    )
    .getValues();

  const productMap = {};
  const customerMap = {};
  const dailyMap = {};
  const monthlyMap = {};
  const unmatchedMap = {};

  const zoneAmount = {
    FD: 0,
    FL: 0
  };

  const matchedNames = new Set();
  const unmatchedNames = new Set();

  let selectedAmount = 0;
  let todayAmount = 0;
  let monthAmount = 0;
  let totalAmount = 0;

  let matchedQty = 0;
  let unmatchedQty = 0;
  let highestUnitPrice = 0;

  rows.forEach(function(row) {
    const occurrenceDate =
      normalizeDateTextJWCHA(row[1]);

    const occurrenceMonth =
      normalizeMonthTextJWCHA(row[2]);

    const zone =
      normalizeTextJWCHA(row[4]);

    const customer =
      String(row[6] || "").trim();

    const productCode =
      String(row[7] || "").trim();

    const productName =
      String(row[9] || "").trim();

    const quantity =
      toNumberJWCHA(row[17]);

    if (
      !occurrenceDate ||
      !["FD", "FL"].includes(zone) ||
      !productName ||
      quantity <= 0
    ) {
      return;
    }

    const normalizedName =
      normalizeNaverProductNameJWCHA(
        productName
      );

    const priceInfo =
      priceMap.get(normalizedName);

    const unitPrice =
      priceInfo &&
      priceInfo.status === "정상"
        ? toNumberJWCHA(
            priceInfo.maxPrice
          )
        : 0;

    const amount =
      quantity * unitPrice;

    /*
     * 전체/오늘/이번 달 금액
     */
    totalAmount += amount;

    if (occurrenceDate === todayText) {
      todayAmount += amount;
    }

    if (
      occurrenceMonth === currentMonth
    ) {
      monthAmount += amount;
    }

    if (unitPrice > 0) {
      matchedQty += quantity;
      matchedNames.add(normalizedName);

      highestUnitPrice = Math.max(
        highestUnitPrice,
        unitPrice
      );

    } else {
      unmatchedQty += quantity;
      unmatchedNames.add(normalizedName);

      if (!unmatchedMap[normalizedName]) {
        unmatchedMap[normalizedName] = {
          name: productName,
          code: productCode,
          quantity: 0
        };
      }

      unmatchedMap[
        normalizedName
      ].quantity += quantity;
    }

    /*
     * 선택 기간 데이터인지 판정
     */
    if (
      !isWebRowInPeriodJWCHA(
        occurrenceDate,
        occurrenceMonth,
        requestedPeriod,
        startDateText,
        todayText,
        currentMonth
      )
    ) {
      return;
    }

    selectedAmount += amount;
    zoneAmount[zone] += amount;

    if (!dailyMap[occurrenceDate]) {
      dailyMap[occurrenceDate] = {
        total: 0,
        FD: 0,
        FL: 0
      };
    }

    dailyMap[
      occurrenceDate
    ].total += amount;

    dailyMap[
      occurrenceDate
    ][zone] += amount;

    if (!monthlyMap[occurrenceMonth]) {
      monthlyMap[occurrenceMonth] = {
        total: 0,
        FD: 0,
        FL: 0
      };
    }

    monthlyMap[
      occurrenceMonth
    ].total += amount;

    monthlyMap[
      occurrenceMonth
    ][zone] += amount;

    if (customer) {
      if (!customerMap[customer]) {
        customerMap[customer] = {
          name: customer,
          quantity: 0,
          amount: 0
        };
      }

      customerMap[
        customer
      ].quantity += quantity;

      customerMap[
        customer
      ].amount += amount;
    }

    if (!productMap[normalizedName]) {
      productMap[normalizedName] = {
        name: productName,
        code: productCode,
        FD: 0,
        FL: 0,
        quantity: 0,
        unitPrice: unitPrice,
        amount: 0,
        priceStatus:
          unitPrice > 0
            ? "정상"
            : "가격 미등록",
        matchedTitle:
          priceInfo
            ? priceInfo.matchedTitle
            : "",
        productUrl:
          priceInfo
            ? priceInfo.link
            : ""
      };
    }

    const product =
      productMap[normalizedName];

    product[zone] += quantity;
    product.quantity += quantity;
    product.amount += amount;

    if (
      unitPrice >
      product.unitPrice
    ) {
      product.unitPrice =
        unitPrice;
    }

    if (unitPrice > 0) {
      product.priceStatus = "정상";
      product.matchedTitle =
        priceInfo.matchedTitle || "";
      product.productUrl =
        priceInfo.link || "";
    }
  });

  const products =
    Object.keys(productMap)
      .map(function(key) {
        const item = productMap[key];
        item.shrinkageAmount = Math.round(
          item.amount * shrinkageRate
        );
        item.adjustedAmount = Math.max(
          0,
          item.amount - item.shrinkageAmount
        );
        return item;
      })
      .sort(function(a, b) {
        if (b.amount !== a.amount) {
          return b.amount - a.amount;
        }

        return b.quantity - a.quantity;
      });

  const customers =
    Object.keys(customerMap)
      .map(function(key) {
        const item = customerMap[key];
        item.shrinkageAmount = Math.round(
          item.amount * shrinkageRate
        );
        item.adjustedAmount = Math.max(
          0,
          item.amount - item.shrinkageAmount
        );
        return item;
      })
      .sort(function(a, b) {
        return b.amount - a.amount;
      })
      .slice(0, 10);

  const daily =
    Object.keys(dailyMap)
      .sort()
      .slice(-31)
      .map(function(date) {
        return {
          date: date,
          total:
            dailyMap[date].total,
          FD:
            dailyMap[date].FD,
          FL:
            dailyMap[date].FL,
          shrinkageAmount:
            Math.round(dailyMap[date].total * shrinkageRate),
          adjustedTotal:
            Math.max(0, dailyMap[date].total - Math.round(dailyMap[date].total * shrinkageRate)),
          adjustedFD:
            Math.max(0, dailyMap[date].FD - Math.round(dailyMap[date].FD * shrinkageRate)),
          adjustedFL:
            Math.max(0, dailyMap[date].FL - Math.round(dailyMap[date].FL * shrinkageRate))
        };
      });

  const monthly =
    Object.keys(monthlyMap)
      .sort()
      .slice(-12)
      .map(function(month) {
        return {
          month: month,
          total:
            monthlyMap[month].total,
          FD:
            monthlyMap[month].FD,
          FL:
            monthlyMap[month].FL,
          shrinkageAmount:
            Math.round(monthlyMap[month].total * shrinkageRate),
          adjustedTotal:
            Math.max(0, monthlyMap[month].total - Math.round(monthlyMap[month].total * shrinkageRate)),
          adjustedFD:
            Math.max(0, monthlyMap[month].FD - Math.round(monthlyMap[month].FD * shrinkageRate)),
          adjustedFL:
            Math.max(0, monthlyMap[month].FL - Math.round(monthlyMap[month].FL * shrinkageRate))
        };
      });

  const unmatchedProducts =
    Object.keys(unmatchedMap)
      .map(function(key) {
        return unmatchedMap[key];
      })
      .sort(function(a, b) {
        return b.quantity - a.quantity;
      });

  return {
    shrinkageRate:
      shrinkageRate,

    selectedAmount:
      selectedAmount,

    selectedShrinkageAmount:
      Math.round(selectedAmount * shrinkageRate),

    selectedAdjustedAmount:
      Math.max(0, selectedAmount - Math.round(selectedAmount * shrinkageRate)),

    todayAmount:
      todayAmount,

    todayShrinkageAmount:
      Math.round(todayAmount * shrinkageRate),

    todayAdjustedAmount:
      Math.max(0, todayAmount - Math.round(todayAmount * shrinkageRate)),

    monthAmount:
      monthAmount,

    monthShrinkageAmount:
      Math.round(monthAmount * shrinkageRate),

    monthAdjustedAmount:
      Math.max(0, monthAmount - Math.round(monthAmount * shrinkageRate)),

    totalAmount:
      totalAmount,

    totalShrinkageAmount:
      Math.round(totalAmount * shrinkageRate),

    totalAdjustedAmount:
      Math.max(0, totalAmount - Math.round(totalAmount * shrinkageRate)),

    fdAmount:
      zoneAmount.FD || 0,

    fdShrinkageAmount:
      Math.round((zoneAmount.FD || 0) * shrinkageRate),

    fdAdjustedAmount:
      Math.max(0, (zoneAmount.FD || 0) - Math.round((zoneAmount.FD || 0) * shrinkageRate)),

    flAmount:
      zoneAmount.FL || 0,

    flShrinkageAmount:
      Math.round((zoneAmount.FL || 0) * shrinkageRate),

    flAdjustedAmount:
      Math.max(0, (zoneAmount.FL || 0) - Math.round((zoneAmount.FL || 0) * shrinkageRate)),

    averageUnitPrice:
      matchedQty > 0
        ? Math.round(
            totalAmount /
            matchedQty
          )
        : 0,

    highestUnitPrice:
      highestUnitPrice,

    matchedQty:
      matchedQty,

    unmatchedQty:
      unmatchedQty,

    matchedProductCount:
      matchedNames.size,

    unmatchedProductCount:
      unmatchedNames.size,

    products:
      products,

    customers:
      customers,

    daily:
      daily,

    monthly:
      monthly,

    zone: [
      {
        zone: "FD",
        label: "센터 파손",
        amount:
          zoneAmount.FD || 0,
        adjustedAmount:
          Math.max(0, (zoneAmount.FD || 0) - Math.round((zoneAmount.FD || 0) * shrinkageRate))
      },
      {
        zone: "FL",
        label: "센터 분실",
        amount:
          zoneAmount.FL || 0,
        adjustedAmount:
          Math.max(0, (zoneAmount.FL || 0) - Math.round((zoneAmount.FL || 0) * shrinkageRate))
      }
    ],

    unmatchedProducts:
      unmatchedProducts
  };
}
 