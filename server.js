const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const schedule = require('node-schedule');
const { main_met } = require('./crawl_metropole');
const { main_met_dorm } = require('./crawl_metropole_dormitory');
const { main_lecturelist } = require('./load_lecturelist');
const { main_lectureinfo } = require('./load_lectureinfo');
const app = express();
const port = 8080;
let mealMetropole;
let mealMetropoleDormitory;
let lectureList;
let lectureInfo;
let serverInitialized = false;
app.use(express.json());
app.use(express.static(__dirname));
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = 'credentials.json';
const SPREADSHEET_ID = '1F3kEbduNvPnsIbfdO9gDZzc1yua1LMs627KAwZsYg6o';
const RANGE = '메트로폴 강의 계획서!A4:AB';
let auth_global;

//스케줄러
const mondaySchedule = schedule.scheduleJob({ dayOfWeek: 0, hour: 10, minute: 0 }, async function() {
  try {
    console.log('크롤링 스케줄 실행 중');
    await main_met();
    await main_met_dorm();
    fs.readFile('./crawl_met.json', 'utf8', (err, data) => {
      if (err) throw err;
      mealMetropole = JSON.parse(data);
    });
    fs.readFile('./crawl_met_dorm.json', 'utf8', (err, data) => {
      if (err) throw err;
      mealMetropoleDormitory = JSON.parse(data);
    });
    console.log('크롤링 스케줄 완료');
  } catch (error) {
    console.error('Error in schedule:', error.message);
  }
});

// Google Sheets API 인증 정보 가져오기
async function authorize() {
  const credentials = JSON.parse(await fs.promises.readFile(CREDENTIALS_PATH));
  const { client_email, private_key } = credentials;

  const auth = new google.auth.JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES, 
  });

  return auth;
}

// Google Sheets에서 데이터 읽기
async function readFromGoogleSheets(auth, spreadsheetId, range) {
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: range,
    });

    const values = response.data.values;
    return values;
  } catch (error) {
    console.error('Error reading data from Google Sheets:', error.message);
    return null;
  }
}

// Google Sheets에 데이터 쓰기
async function writeToGoogleSheets(auth, spreadsheetId, range, data) {
  const sheets = google.sheets({ version: 'v4', auth });
  const resource = {
    values: [data],
  };
  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    resource,
  });
}

async function batchWriteToGoogleSheets(auth, spreadsheetId, ranges, rowDataArray) {
  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const resource = {
      valueInputOption: 'RAW',
      data: ranges.map((range, index) => ({
        range: range,
        majorDimension: 'ROWS',
        values: [rowDataArray[index]]
      }))
    };

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: spreadsheetId,
      resource: resource
    });
  } catch (error) {
    console.error('Error writing data to Google Sheets:', error.message);
  }
}

// 사용자 ID로 시트에서 해당 행을 찾는 함수
async function findUserRow(userId, auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: '시간표!A:A', // userId가 있는 열 범위
  });
  const rows = response.data.values;
  if (rows) {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === userId) {
        return i + 1; // 행 인덱스는 1부터 시작하므로 +1
      }
    }
  }
  return null; // 사용자의 행을 찾지 못한 경우
}

async function addUserRow(userId, auth, spreadsheetId) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: '시간표!A:A', // userId가 있는 열 범위
    valueInputOption: 'RAW',
    resource: { values: [[userId]] },
  });
  return response.data.updates.updatedRange.split(':')[0].replace('시간표!', ''); // 사용자의 행 번호 반환
}

// 시간표의 시간 문자열을 이용하여 열 인덱스를 계산하는 함수
function getTimeIndex(time) {
  const indices = [];

  if (time.includes('),')) {
    const periods = time.split('),');

    periods.forEach(period => {
      const [day, hourString] = period.split('(');
      const hours = hourString.replace(')', '').split(',');

      hours.forEach(hour => {
        const formattedDay = day + '(' + hour + ')';
        indices.push(formattedDay);
      });
    });
  } else if (time.length > 4) {
    const [day, hourString] = time.split('(');
    const hours = hourString.replace(')', '').split(',');
    
    hours.forEach(hour => {
      const formattedDay = day + '(' + hour + ')';
      indices.push(formattedDay);
    });
  } else {
    indices.push(time);
  }

  return indices;
}

function getColumnIndex(timeIndices) {
  const result = [];
  const Array1 = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];
  const Array2 = ['Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC', 'AD', 'AE'];
  const Array3 = ['AF', 'AG', 'AH', 'AI', 'AJ', 'AK', 'AL', 'AM', 'AN', 'AO', 'AP', 'AQ', 'AR', 'AS', 'AT'];
  const Array4 = ['AU', 'AV', 'AW', 'AX', 'AY', 'AZ', 'BA', 'BB', 'BC', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI'];
  const Array5 = ['BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BQ', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW', 'BX'];

  for (const index of timeIndices) {
    let letter;
    const day = index.split('(')[0];
    const num = parseInt(index.split('(')[1]);

    if (num < 1 || num > 15) {
      throw new Error('Invalid index');
    }

    switch (day) {
      case '월':
        letter = Array1[num - 1];
        break;
      case '화':
        letter = Array2[num - 1];
        break;
      case '수':
        letter = Array3[num - 1];
        break;
      case '목':
        letter = Array4[num - 1];
        break;
      case '금':
        letter = Array5[num - 1];
        break;
      default:
        throw new Error('Invalid day');
    }

    result.push(letter);
  }

  return result;
}

//함수
//요일 환산
function gettoDay() {
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[today];
}

//수업 교시 환산
function getCurrentClass() {
  const now = new Date();
  const KST = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();

  const classTimes = [
    { start: 8, end: 9, minute: 30 },
    { start: 9, end: 10, minute: 30 },
    { start: 10, end: 11, minute: 30 },
    { start: 11, end: 12, minute: 30 },
    { start: 12, end: 13, minute: 30 },
    { start: 13, end: 14, minute: 30 },
    { start: 14, end: 15, minute: 30 },
    { start: 15, end: 16, minute: 30 },
    { start: 16, end: 17, minute: 30 },
    { start: 17, end: 18, minute: 30 },
    { start: 18, end: 19, minute: 30 },
    { start: 19, end: 20, minute: 30 },
    { start: 20, end: 21, minute: 30 },
    { start: 21, end: 22, minute: 30 },
    { start: 22, end: 23, minute: 30 }
  ];

  for (let i = 0; i < classTimes.length; i++) {
    const classTime = classTimes[i];
    if (
      (currentHour === classTime.start && currentMinute >= classTime.minute) ||
      (currentHour > classTime.start && currentHour < classTime.end) ||
      (currentHour === classTime.end && currentMinute <= classTime.minute)
    ) {
      return i;
    }
  }

  return null;
}

function findUniqElem(arr1, arr2) {
  return arr1.filter(x => !arr2.includes(x));
}

//현재 빈 강의실 추출
function findAvailableClassrooms(lectureList) {
  const today = gettoDay();
  const currentClass = getCurrentClass();
  const availableClassrooms = [];
  const unavailableClassrooms = [];

  for (const lectureKey in lectureList) {
    const lecture = lectureList[lectureKey];
    
    if (lecture.hasOwnProperty("시간표") && lecture.hasOwnProperty("캠퍼스")) {
      const classTime = lecture["시간표"];
      
      if (classTime !== "" && classTime.includes(today) && currentClass && !classTime.includes(currentClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        availableClassrooms.push(lecture["강의실"]);
      } else if (classTime !== "" && classTime.includes(today) && currentClass && classTime.includes(currentClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        unavailableClassrooms.push(lecture["강의실"]);
      }
    }
    else {
      console.log("Lecture does not have '시간표' or '캠퍼스' property:", lecture);
    }
  }

  return findUniqElem(availableClassrooms, unavailableClassrooms);
}

//다음 교시 빈 강의실 추출
function findAvailableClassroomsNext(lectureList) {
  const today = gettoDay();
  const nextClass = getCurrentClass() + 1;
  const availableClassrooms = [];
  const unavailableClassrooms = [];

  for (const lectureKey in lectureList) {
    const lecture = lectureList[lectureKey];

    if (lecture.hasOwnProperty("시간표")) {
      const classTime = lecture["시간표"];

      if (classTime !== "" && classTime.includes(today) && nextClass && !classTime.includes(nextClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        availableClassrooms.push(lecture["강의실"]);
      } else if (classTime !== "" && classTime.includes(today) && nextClass && classTime.includes(nextClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        unavailableClassrooms.push(lecture["강의실"]);
      }
    }
    else {
      console.log("Lecture does not have '시간표' property:", lecture);
    }
  }

  return findUniqElem(availableClassrooms, unavailableClassrooms);
}

//층수 기입
function getFloorName(floorCode) {
  switch (floorCode) {
    case '1':
      return '1층';
    case '2':
      return '2층';
      case '3':
      return '3층';
      case '4':
      return '4층';
      case '5':
      return '5층';
      case '6':
      return '6층';
      case '7':
      return '7층';
      case '8':
      return '8층';
      case '9':
      return '9층';
      case '0':
      return '10층';
    default:
      return `Unknown Floor ${floorCode}`;
  }
}

function getCurrentFloor(classroom) {
  const floorCode = classroom.slice(1, 2);
  return getFloorName(floorCode);
}

//현재 우당관 템플릿
function createBuildingResponse_1(buildingName, buildingCode, floors, hasCarousel) {
  const currentClass = getCurrentClass();
  const items = [];
  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒현재 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f16b9d21bdeb24853d9669`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

//현재 선덕관 템플릿
function createBuildingResponse_2(buildingName, buildingCode, floors, hasCarousel) {
  const currentClass = getCurrentClass();
  const items = [];

  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒현재 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f16bac82abcd51947bf6d4`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

//현재 충효관 템플릿
function createBuildingResponse_3(buildingName, buildingCode, floors, hasCarousel) {
  const currentClass = getCurrentClass();
  const items = [];

  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒현재 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f18d02303da839d8dfc680`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

//다음 교시 우당관 템플릿
function createBuildingResponseNext_1(buildingName, buildingCode, floors, hasCarousel) {
  const nextClass = getCurrentClass() + 1;
  const items = [];

  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒다음 교시 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f16b9d21bdeb24853d9669`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

//다음 교시 선덕관 템플릿
function createBuildingResponseNext_2(buildingName, buildingCode, floors, hasCarousel) {
  const nextClass = getCurrentClass() + 1;
  const items = [];

  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒다음 교시 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f16bac82abcd51947bf6d4`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

//다음 교시 충효관 템플릿
function createBuildingResponseNext_3(buildingName, buildingCode, floors, hasCarousel) {
  const nextClass = getCurrentClass() + 1;
  const items = [];

  for (const [floor, classrooms] of Object.entries(floors)) {
    if (classrooms.length > 0) {
      // 중복 제거
      const uniqueClassrooms = removeDuplicates(classrooms);

      const item = {
        title: `🕒다음 교시 빈 강의실[${buildingName} ${getFloorLabel(floor)}]🕒`,
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`
      };
      items.push(item);
    }
  }

  const response = {
    version: '2.0',
    template: {
      outputs: [
        {
          carousel: {
            type: 'textCard',
            items: items,
          },
        },
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65f18d02303da839d8dfc680`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    },
  };

  return response;
}

function getFloorLabel(floor) {
  return `${floor}`;
}

//층 정렬
function sortFloors(floors) {
  const sortedFloors = {};
  Object.keys(floors).sort((a, b) => parseInt(a) - parseInt(b)).forEach(key => {
    sortedFloors[key] = floors[key].sort();
  });
  return sortedFloors;
}

//중복 제거
function removeDuplicates(arr) {
  return [...new Set(arr)];
}

function removeDuplicatesAndEmpty(data) {
  const uniqueData = Array.from(new Set(data));
  const filteredData = uniqueData.filter(row => row.trim() !== "");
  return filteredData;
}

function findSimilarLectures(userInput, lectureInfo) {
  if (userInput){
    const userInputProcessed = userInput.replace(/\s+/g, '').toUpperCase();
    const similarLectures = lectureInfo.filter(item => {
      const subjectWithoutSpaces = item.과목명.replace(/\s+/g, '').toUpperCase();
      return subjectWithoutSpaces.includes(userInputProcessed);
    });
    return similarLectures;
  }
}

function findSimilarProfessors(userInput, lectureInfo) {
  if (userInput){
    const userInputProcessed = userInput.replace(/\s+/g, '').toUpperCase();
    let similarProfessors = lectureInfo.filter(item => {
      const subjectWithoutSpaces = item.교수명.replace(/\s+/g, '').toUpperCase();
      return subjectWithoutSpaces.includes(userInputProcessed);
    });

    similarProfessors = similarProfessors.filter((prof, index, self) =>
    index === self.findIndex(p => p.교수명 === prof.교수명)
    );
  
    return similarProfessors;
  }
}

function findSimilarProfessorsNofilter(userInput, lectureInfo) {
  if (userInput){
    const userInputProcessed = userInput.replace(/\s+/g, '').toUpperCase();
    const similarProfessors = lectureInfo.filter(item => {
      const subjectWithoutSpaces = item.교수명.replace(/\s+/g, '').toUpperCase();
      return subjectWithoutSpaces.includes(userInputProcessed);
    });
  
    return similarProfessors;
  }
}

//서버 초기화
async function initialize() {
  try {
    console.log('서버 초기화 중');
    auth_global = await authorize();
    //await main_met();
    //await main_met_dorm();
    await main_lecturelist();
    await main_lectureinfo();
    fs.readFile('./crawl_met.json', 'utf8', (err, data) => {
      if (err) throw err;
      mealMetropole = JSON.parse(data);
    });
    fs.readFile('./crawl_met_dorm.json', 'utf8', (err, data) => {
      if (err) throw err;
      mealMetropoleDormitory = JSON.parse(data);
    });
    fs.readFile('./lecturelist.json', 'utf8', (err, data) => {
      if (err) throw err;
      lectureList = JSON.parse(data);
    });
    fs.readFile('./lectureinfo.json', 'utf8', (err, data) => {
      if (err) throw err;
      lectureInfo = JSON.parse(data);
    });
    console.log('서버 초기화 완료');
    serverInitialized = true;
  } catch (error) {
    console.error('Error during initialization:', error.message);
  }
}
initialize();

//엔드포인트
app.get('/', (req, res) => {
  res.send('서버가 실행 중입니다.');
});

app.get('/keyboard', (req, res) => {
  const data = { 'type': 'text' }
  res.json(data);
});

//서버 대기
app.use((req, res, next) => {
  if (!serverInitialized) {
    const response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "서버 초기화 중입니다.",
              "description": "잠시 후 다시 시도해주세요.",
              "buttons": [
                {
                  'action': 'message',
                  'label': `처음으로`,
                  'messageText': `처음으로`
                },
              ]
            }
          }
        ]
      }
    }
    res.json(response);
    return;
  }
  next();
});

//서버 재시작
app.post('/restart', (req, res) => {
  serverInitialized = false;
  initialize();
  res.json({ message: '서버 재시작' });
});

//서버 종료
app.post('/shutdown', (req, res) => {
  console.log('서버를 종료합니다.');
  res.json({ message: '서버가 종료됩니다.' });

  // 프로세스 종료
  process.exit();
});

//서버 업데이트
app.post('/update', async (req, res) => {
  try {
    await main_lecturelist();
    await main_lectureinfo();
    fs.readFile('./lecturelist.json', 'utf8', (err, data) => {
      if (err) throw err;
      lectureList = JSON.parse(data);
    });
    fs.readFile('./lectureinfo.json', 'utf8', (err, data) => {
      if (err) throw err;
      lectureInfo = JSON.parse(data);
    });
    res.json({ message: '데이터가 업데이트되었습니다.' });
  } catch (error) {
    console.error('Error during update:', error.message);
    res.status(500).json({ error: '업데이트 중 오류가 발생했습니다.' });
  }
});

//탈출블록
app.post('/cancle', (req, res) => {
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `입력이 취소 되었습니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
});

//오늘의 학식 - 학생식당, 기숙사
app.post('/today', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[today];
  const todayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "학식이 제공되지않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  }
  else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "carousel": {
              "type": "textCard",
              "items": [
                {
                    "title": "🍴오늘의 학식[학생식당]🍴",
                    "description": `한정식▼\n${todayMealMetropole.meal}`,
                    "buttons": [
                      {
                        'action': 'block',
                        'label': `원산지 확인`,
                        'blockId': `65ed16f940d33a5902c955aa`
                      },
                  ]
                },
                {
                  "title": "🍴오늘의 학식[기숙사]🍴",
                  "description": `조식▼\n${todayMealMetropoleDormitory.breakfast}\n\n석식▼\n${todayMealMetropoleDormitory.dinner}`,
                  "buttons": [
                    {
                      'action': 'block',
                      'label': `원산지 확인`,
                      'blockId': `65f830170a28195b33a8e2a1`
                    },
                ]
              }
              ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    };
  }

  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//내일의 학식 - 학생식당, 기숙사
app.post('/tomorrow', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  KST.setDate(KST.getDate() + 1);
  const tomorrow = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[tomorrow];
  const tomorrowMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const tomorrowMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (tomorrow === 0 || tomorrow === 6) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "내일은 주말입니다.",
              "description": "학식이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  }
  else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "carousel": {
              "type": "textCard",
              "items": [
                {
                    "title": "🍴내일의 학식[학생식당]🍴",
                    "description": `한정식▼\n${tomorrowMealMetropole.meal}`,
                    "buttons": [
                      {
                        'action': 'block',
                        'label': `원산지 확인`,
                        'blockId': `65ee8171d287ba103c2cd6ac`
                      },
                  ]
                },
                {
                  "title": "🍴내일의 학식[기숙사]🍴",
                  "description": `조식▼\n${tomorrowMealMetropoleDormitory.breakfast}\n\n석식▼\n${tomorrowMealMetropoleDormitory.dinner}`,
                  "buttons": [
                    {
                      'action': 'block',
                      'label': `원산지 확인`,
                      'blockId': `65f830b7c94fce5471d9a2f9`
                    },
                ]
              }
              ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    };
  }

  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//오늘의 학식 - 학생식당 원산지
app.post('/today_origin', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[today];
  const todayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "학식이 제공되지않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  }else{
  response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "🍴오늘의 학식[학생식당] - 원산지🍴",
              "description": `${todayMealMetropole.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ca1b7109dcef4315f12fd3`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    };
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//오늘의 학식 - 기숙사 원산지
app.post('/today_origin_dorm', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[today];
  const todayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "학식이 제공되지않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  } else{
  response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "🍴오늘의 학식[기숙사] - 원산지🍴",
              "description": `${todayMealMetropoleDormitory.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ca1b7109dcef4315f12fd3`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    };
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//내일의 학식 - 학생식당 원산지
app.post('/tomorrow_origin', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  KST.setDate(KST.getDate() + 1);
  const tomorrow = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[tomorrow];
  const tomorrowMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const tomorrowMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (tomorrow === 0 || tomorrow === 6) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "내일은 주말입니다.",
              "description": "학식이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  } else {
  response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "🍴내일의 학식[학생식당] - 원산지🍴",
              "description": `${tomorrowMealMetropole.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ee8168c8612a194feaff1d`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//내일의 학식 - 기숙사 원산지
app.post('/tomorrow_origin_dorm', (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  KST.setDate(KST.getDate() + 1);
  const tomorrow = KST.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[tomorrow];
  const tomorrowMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const tomorrowMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);
  let response;

  if (tomorrow === 0 || tomorrow === 6) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "내일은 주말입니다.",
              "description": "학식이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]

      }
    }
  } else {
  response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "🍴내일의 학식[기숙사] - 원산지🍴",
              "description": `${tomorrowMealMetropoleDormitory.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ee8168c8612a194feaff1d`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//이번주 학식 - 학생식당, 기숙사
app.post('/week', (req, res) => {
try{
  const response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "🍴이번주 학식🍴",
              "buttons": [
                {
                  'action': 'block',
                  'label': `한정식[학생식당]`,
                  'blockId': `65ee8c4499eaa8487e2a54df`
                },
                {
                  'action': 'block',
                  'label': `조식, 석식[기숙사]`,
                  'blockId': `65ee8c9b5f95a271a0afa67d`
                },
            ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});


//이번주 학식 - 학생식당
app.post('/week_met', async (req, res) => {
  try{
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const weekMeals = [];
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = daysOfWeek[i];
    const todayMealMetropole = mealMetropole.data.find(item => item.date === dayOfWeek);
    const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === dayOfWeek);

    if (i === 0 || i === 6) {
      continue;
    }

    weekMeals.push({
        "title": `🍴${dayOfWeek} 학식[학생식당]🍴`,
        "description": `한정식▼\n${todayMealMetropole.meal}`,
        "buttons": [
          {
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ee6281e88704127f3d8446`,
            'extra': {
              'met_day' : `${dayOfWeek}`
            }
          },
        ]
    });
  }

  const response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "carousel": {
            "type": "textCard",
            "items": weekMeals
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65ca1c5709dcef4315f12fe8`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  };

  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//이번주 학식 - 기숙사
app.post('/week_met_dorm', async (req, res) => {
  try{
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const weekMeals = [];
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = daysOfWeek[i];
    const todayMealMetropole = mealMetropole.data.find(item => item.date === dayOfWeek);
    const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === dayOfWeek);

    if (i === 0 || i === 5 || i === 6) {
      continue;
    }

    weekMeals.push({
        "title": `🍴${dayOfWeek} 학식[기숙사]🍴`,
        "description": `조식▼\n${todayMealMetropoleDormitory.breakfast}\n\n석식▼\n${todayMealMetropoleDormitory.dinner}`,
        "buttons": [
          {
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ee9fa1693153232294d2a5`,
            'extra': {
              'met_dorm_day' : `${dayOfWeek}`
            }
          },
        ]
    });
  }

  const response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "carousel": {
            "type": "textCard",
            "items": weekMeals
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'block',
          'label': `뒤로가기`,
          'blockId': `65ca1c5709dcef4315f12fe8`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  };

  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//이번주 학식 = 학생식당 원산지
app.post('/week_met_origin', async (req, res) => {
  try{
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const { met_day } = req.body.action.clientExtra;
  
  const targetDayIndex = daysOfWeek.indexOf(met_day);
  if (targetDayIndex !== -1) {
    const targetDay = daysOfWeek[targetDayIndex];
    const tagetdayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
    const tagetdayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

    const response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": `🍴${met_day} 학식[학생식당] - 원산지🍴`,
              "description": `${tagetdayMealMetropole.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ee8c4499eaa8487e2a54df`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
  res.json(response);
  }
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//이번주 학식 = 기숙사 원산지
app.post('/week_met_dorm_origin', async (req, res) => {
  try{
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const { met_dorm_day } = req.body.action.clientExtra;
  
  const targetDayIndex = daysOfWeek.indexOf(met_dorm_day);
  if (targetDayIndex !== -1) {
    const targetDay = daysOfWeek[targetDayIndex];
    const tagetdayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
    const tagetdayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

    const response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": `🍴${met_dorm_day} 학식[기숙사] - 원산지🍴`,
              "description": `${tagetdayMealMetropoleDormitory.origin}`,
        }
        }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `65ee8c9b5f95a271a0afa67d`
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
  res.json(response);
  }
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});


//빈 강의실 찾기
app.post('/lecture_find', async (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else if (!isClassTime){
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "수업시간이 아닙니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "carousel": {
              "type": "textCard",
              "items": [
                {
                    "title": "강의실 찾기",
                    "description": `- 빈 강의실이 있는 층만 표기됩니다.`,
                    "buttons": [
                      {
                        'action': 'block',
                        'label': `우당관`,
                        'blockId': `65f16b9d21bdeb24853d9669`
                      },
                      {
                        'action': 'block',
                        'label': `선덕관`,
                        'blockId': `65f16bac82abcd51947bf6d4`
                      },
                      {
                        'action': 'block',
                        'label': `충효관`,
                        'blockId': `65f18d02303da839d8dfc680`
                      },
                  ]
                },
                
              ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    };
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//현재 빈 강의실 - 우당관
app.post('/empty_lecture_now_1', async (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else if (!isClassTime){
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "수업시간이 아닙니다.",
                "description": "해당 기능이 제공되지 않습니다.",
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            },
          ]
        }
      }
    } else {
    const empty = findAvailableClassrooms(lectureList);

    const buildingCode = '1';
    const floors = {
      '1': [], '2': [], '3': [], '4': [], '5': [],
      '6': [], '7': [], '8': [], '9': [], '0': [],
    };

    empty.forEach(classroom => {
      const currentBuildingCode = classroom.charAt(0);
      const floorName = getCurrentFloor(classroom);

      if (currentBuildingCode === buildingCode) {
        if (!floors[floorName]) {
          floors[floorName] = [];
        }

        floors[floorName].push(classroom);
      }
    });

    const sortedFloors = sortFloors(floors);

    response = createBuildingResponse_1('우당관', buildingCode, sortedFloors, false);
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//현재 빈 강의실 - 선덕관
app.post('/empty_lecture_now_2', async (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else if (!isClassTime){
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "수업시간이 아닙니다.",
                "description": "해당 기능이 제공되지 않습니다.",
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            },
          ]
        }
      }
    } else {
  const empty = findAvailableClassrooms(lectureList);

  const buildingCode = '2';
  const floors = {
    '1': [], '2': [], '3': [], '4': [], '5': [],
    '6': [], '7': [], '8': [], '9': [], '0': [],
  };

  empty.forEach(classroom => {
    const currentBuildingCode = classroom.charAt(0);
    const floorName = getCurrentFloor(classroom);

    if (currentBuildingCode === buildingCode) {
      if (!floors[floorName]) {
        floors[floorName] = [];
      }

      floors[floorName].push(classroom);
    }
  });

  const sortedFloors = sortFloors(floors);

  response = createBuildingResponse_2('선덕관', buildingCode, sortedFloors, false);
}
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//현재 빈 강의실 - 충효관
app.post('/empty_lecture_now_3', async (req, res) => {
  try{
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else if (!isClassTime){
        response = {
          "version": "2.0",
          "template": {
            "outputs": [
              {
                "textCard": {
                  "title": "수업시간이 아닙니다.",
                  "description": "해당 기능이 제공되지 않습니다.",
                }
              }
            ],
            "quickReplies": [
              {
                'action': 'message',
                'label': `처음으로`,
                'messageText': `처음으로`
              },
            ]
          }
        }
      } else {
    const empty = findAvailableClassrooms(lectureList);

    const buildingCode = '3';
    const floors = {
      '1': [], '2': [], '3': [], '4': [], '5': [],
      '6': [], '7': [], '8': [], '9': [], '0': [],
    };

    empty.forEach(classroom => {
      const currentBuildingCode = classroom.charAt(0);
      const floorName = getCurrentFloor(classroom);

      if (currentBuildingCode === buildingCode) {
        if (!floors[floorName]) {
          floors[floorName] = [];
        }

        floors[floorName].push(classroom);
      }
    });

    const sortedFloors = sortFloors(floors);

    response = createBuildingResponse_3('충효관', buildingCode, sortedFloors, false);
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//다음 교시 빈 강의실 - 우당관
app.post('/empty_lecture_next_1', async (req, res) => {
  try {
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "오늘은 주말입니다.",
                "description": "해당 기능이 제공되지 않습니다.",
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            },
          ]
        }
      }
    } else if (!isClassTime){
        response = {
          "version": "2.0",
          "template": {
            "outputs": [
              {
                "textCard": {
                  "title": "수업시간이 아닙니다.",
                  "description": "해당 기능이 제공되지 않습니다.",
                }
              }
            ],
            "quickReplies": [
              {
                'action': 'message',
                'label': `처음으로`,
                'messageText': `처음으로`
              },
            ]
          }
        }
      } else {
    const empty = findAvailableClassroomsNext(lectureList);

    const buildingCode = '1';
    const floors = {
      '1': [], '2': [], '3': [], '4': [], '5': [],
      '6': [], '7': [], '8': [], '9': [], '0': [],
    };

    empty.forEach(classroom => {
      const currentBuildingCode = classroom.charAt(0);
      const floorName = getCurrentFloor(classroom);

      if (currentBuildingCode === buildingCode) {
        if (!floors[floorName]) {
          floors[floorName] = [];
        }

        floors[floorName].push(classroom);
      }
    });

    const sortedFloors = sortFloors(floors);

    response = createBuildingResponseNext_1('우당관', buildingCode, sortedFloors, false);
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//다음 교시 빈 강의실 - 선덕관
app.post('/empty_lecture_next_2', async (req, res) => {
  try {
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "오늘은 주말입니다.",
                "description": "해당 기능이 제공되지 않습니다.",
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            },
          ]
        }
      }
    } else if (!isClassTime){
        response = {
          "version": "2.0",
          "template": {
            "outputs": [
              {
                "textCard": {
                  "title": "수업시간이 아닙니다.",
                  "description": "해당 기능이 제공되지 않습니다.",
                }
              }
            ],
            "quickReplies": [
              {
                'action': 'message',
                'label': `처음으로`,
                'messageText': `처음으로`
              },
            ]
          }
        }
      } else {
    const empty = findAvailableClassroomsNext(lectureList);

    const buildingCode = '2';
    const floors = {
      '1': [], '2': [], '3': [], '4': [], '5': [],
      '6': [], '7': [], '8': [], '9': [], '0': [],
    };

    empty.forEach(classroom => {
      const currentBuildingCode = classroom.charAt(0);
      const floorName = getCurrentFloor(classroom);

      if (currentBuildingCode === buildingCode) {
        if (!floors[floorName]) {
          floors[floorName] = [];
        }

        floors[floorName].push(classroom);
      }
    });

    const sortedFloors = sortFloors(floors);

    response = createBuildingResponseNext_2('선덕관', buildingCode, sortedFloors, false);
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//다음 교시 빈 강의실 - 충효관
app.post('/empty_lecture_next_3', async (req, res) => {
  try {
  const offset = 1000 * 60 * 60 * 9
  const KST = new Date((new Date()).getTime() + offset)
  const today = KST.getDay();
  const currentHour = KST.getHours();
  const currentMinute = KST.getMinutes();
  const isClassTime = currentHour > 8 || (currentHour === 8 && currentMinute >= 30) && (currentHour < 23 || (currentHour === 23 && currentMinute <= 30));
  let response;

  if (today === 6 || today === 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "오늘은 주말입니다.",
              "description": "해당 기능이 제공되지 않습니다.",
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          },
        ]
      }
    }
  } else if (!isClassTime){
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "수업시간이 아닙니다.",
                "description": "해당 기능이 제공되지 않습니다.",
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            },
          ]
        }
      }
    } else {
  const empty = findAvailableClassroomsNext(lectureList);

  const buildingCode = '3';
  const floors = {
    '1': [], '2': [], '3': [], '4': [], '5': [],
    '6': [], '7': [], '8': [], '9': [], '0': [],
  };

  empty.forEach(classroom => {
    const currentBuildingCode = classroom.charAt(0);
    const floorName = getCurrentFloor(classroom);

    if (currentBuildingCode === buildingCode) {
      if (!floors[floorName]) {
        floors[floorName] = [];
      }

      floors[floorName].push(classroom);
    }
  });

  const sortedFloors = sortFloors(floors);

  response = createBuildingResponseNext_3('충효관', buildingCode, sortedFloors, false);
}
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//강의명 검색
app.post('/lecture_info_find', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let response = {};

  if(extra && extra.type === "back_select"){
    userInput = extra.userInput;
  } else{
    userInput = req.body.action.params.lecture_name;
  }

  const similarLectures = findSimilarLectures(userInput, lectureInfo);
  
  if (similarLectures && similarLectures.length > 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `※번호 확인 후 번호 입력 클릭※\n\n과목 - 교수 - 분반 순\n\n${similarLectures.map((lecture, index) => `${index + 1}.${lecture.과목명} ${lecture.교수명} ${lecture.분반}`).join('\n')}\n`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `번호 입력`,
            'blockId': `65fff8a7a64303558478534d`,//select
            'extra':{
              'userInput': userInput,
            }
          },
          {
            'action': 'block',
            'label': `다시 입력`,
            'blockId': `65ffd578dad261262541fc58`//find
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `일치하거나 유사한 강의가 없습니다.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `다시 입력`,
            'blockId': `65ffd578dad261262541fc58`//find
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_info_select', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let lecture_no;
  let response = {};

  if(extra && extra.type === "back_search"){
    userInput = extra.userInput;
    lecture_no = extra.lecture_no;
  }else{
    userInput = extra.userInput;
    lecture_no = req.body.action.params.lecture_no;
  }

  const similarLectures = findSimilarLectures(userInput, lectureInfo);
  
  if (similarLectures && similarLectures[lecture_no - 1]) {
    const selectedLecture = similarLectures[lecture_no - 1];
    
    const selectedLectureInfo = lectureInfo.find(lecture => 
      lecture.과목명 === selectedLecture.과목명 &&
      lecture.교수명 === selectedLecture.교수명 &&
      lecture.분반 === selectedLecture.분반
    );

    if (!selectedLectureInfo) {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": `강의 정보를 찾을 수 없습니다.`
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `66014e049cc5814a007f0ff9`,//find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      }
    } else {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "선택한 강의",
                "description": `강의명: ${selectedLectureInfo.과목명}\n교수명: ${selectedLectureInfo.교수명}\n분반: ${selectedLectureInfo.분반}`,
                "buttons": [
                  {
                    "action": "block",
                    "label": "강좌 기본정보",
                    "blockId": "66004580d7cbb10c92fb7c3f",//search
                    "extra": {
                      "menu": "basicInfo",
                      'userInput': userInput,
                      'lecture_no': lecture_no,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  },
                  {
                    "action": "block",
                    "label": "교과개요",
                    "blockId": "66004580d7cbb10c92fb7c3f",//search
                    "extra": {
                      "menu": "courseOverview",
                      'userInput': userInput,
                      'lecture_no': lecture_no,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  },
                  {
                    "action": "block",
                    "label": "평가항목 및 방법",
                    "blockId": "66004580d7cbb10c92fb7c3f",//search
                    "extra": {
                      "menu": "evaluationMethods",
                      'userInput': userInput,
                      'lecture_no': lecture_no,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  }
                ]
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `시간표에 저장`,
              'blockId': `660981bc73a80e4a1e58d2e3`,//schedule_save
              'extra':{
                'save': {
                  'type': "lecture",
                  'userInput': userInput,
                  'lecture_no': lecture_no,
                  'lectures': selectedLectureInfo.과목명,
                  'professor': selectedLectureInfo.교수명,
                  'classes': selectedLectureInfo.분반
                }
              }
            },
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `66014e049cc5814a007f0ff9`,//find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
                'lecture_no': lecture_no
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      };
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `올바른 번호를 입력해주세요.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `66014e049cc5814a007f0ff9`,//find2
            'extra':{
              'type': 'back_select',
                'userInput': userInput,
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_info_search', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  const userInput = extra.userInput;
  const lecture_no = extra.lecture_no;
  const lectures = extra.select.lectures;
  const professor = extra.select.professor;
  const classes = extra.select.classes;
  const selectedLectureInfo = lectureInfo.find(lecture => 
    lecture.과목명 === lectures &&
    lecture.교수명 === professor &&
    lecture.분반 === classes
  );
  const selectedLectureInfo2 = lectureList.find(lecture => 
    lecture.과목명 === lectures &&
    lecture.교수명 === professor &&
    lecture.분반 === classes
  );
  let response = {};

  if (extra && extra.menu === "basicInfo") {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "강좌 기본정보",
              "description": `과목코드: ${selectedLectureInfo2.과목코드}\n과목명: ${selectedLectureInfo2.과목명}\n시간표: ${selectedLectureInfo2.시간표}\n강의실: ${selectedLectureInfo2.강의실}\n교수명: ${selectedLectureInfo.교수명}\n핸드폰: ${selectedLectureInfo.핸드폰}\n이메일: ${selectedLectureInfo.이메일}\n분반: ${selectedLectureInfo.분반}\n성적평가구분: ${selectedLectureInfo.성적평가구분}\n과정구분: ${selectedLectureInfo.과정구분}\n이수구분: ${selectedLectureInfo.이수구분}\n개설학과: ${selectedLectureInfo.개설학과}\n개설학년: ${selectedLectureInfo.개설학년}\n교재 및 참고 문헌: ${selectedLectureInfo['교재 및 참고 문헌']}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `66014fc63190593813f158f6`,//select2
              'extra':{
                'type': 'back_search',
                'userInput': userInput,
                'lecture_no': lecture_no
              }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  else if (extra && extra.menu === "courseOverview") {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "교과개요",
              "description": `교과목개요▼\n ${selectedLectureInfo.교과목개요}\n\n교과목표▼\n ${selectedLectureInfo.교과목표}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `66014fc63190593813f158f6`,//select2
            'extra':{
              'type': 'back_search',
              'userInput': userInput,
              'lecture_no': lecture_no
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "평가항목 및 방법",
              "description": `출석▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].출석.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].출석.평가방법_및_주요내용}\n\n중간▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].중간.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].중간.평가방법_및_주요내용}\n\n기말▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].기말.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].기말.평가방법_및_주요내용}\n\n과제▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].과제.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].과제.평가방법_및_주요내용}\n\n기타▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].기타.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].기타.평가방법_및_주요내용}\n\n과제개요▼\n 과제주제: ${selectedLectureInfo['평가항목 및 방법'].과제개요.과제주제}\n 분량 : ${selectedLectureInfo['평가항목 및 방법'].과제개요.분량}\n 제출일자: ${selectedLectureInfo['평가항목 및 방법'].과제개요.제출일자}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `66014fc63190593813f158f6`,//select2
            'extra':{
              'type': 'back_search',
              'userInput': userInput,
              'lecture_no': lecture_no
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//교수 정보 검색
app.post('/lecture_professor_find', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let response = {};

  if(extra && extra.type === "back_select"){
    userInput = extra.userInput;
  } else{
    userInput = req.body.action.params.professor_name;
  }

  const similarProfessors = findSimilarProfessors(userInput, lectureInfo);
  
  if (similarProfessors && similarProfessors.length > 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `※번호 확인 후 번호 입력 클릭※\n\n${similarProfessors.map((lecture, index) => `${index + 1}.${lecture.교수명}`).join('\n')}\n`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `번호 입력`,
            'blockId': `660181fd4311bb7fed54a75f`,//pro_select
            'extra':{
              'userInput': userInput,
            }
          },
          {
            'action': 'block',
            'label': `다시 입력`,
            'blockId': `65ffd650a64303558478508f`//pro_find
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `일치하거나 유사한 교수가 없습니다.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `다시 입력`,
            'blockId': `65ffd650a64303558478508f`//pro_find
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

//교수
app.post('/lecture_professor_select', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let professor_no;
  let professor_no2;
  let professor_name;
  let response = {};

  if(extra && extra.type === "back_info_find"){
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  } else{
    userInput = extra.userInput;
    professor_no = req.body.action.params.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  }
  
  const similarProfessors = findSimilarProfessors(userInput, lectureInfo);
  
  if (similarProfessors) {
    const selectedProfessors = similarProfessors[professor_no - 1];
    
    if (!selectedProfessors) {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": `교수 정보를 찾을 수 없습니다.`
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `660187634311bb7fed54a7ce`,//pro_find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      }
    } else {
      const selectedProfessorInfo = lectureInfo.find(lecture => 
        lecture.교수명 === selectedProfessors.교수명
      );
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": `${selectedProfessorInfo.교수명} 교수 정보`,
                "description": `교수명: ${selectedProfessorInfo.교수명}\n핸드폰: ${selectedProfessorInfo.핸드폰}\n이메일: ${selectedProfessorInfo.이메일}`,
                "buttons": [
                  {
                    'action': 'block',
                    'label': `개설강좌 리스트`,
                    'blockId': `66093382eb6af05590a00433`, //pro_info_find2
                    'extra': {
                      'userInput': userInput,
                      'professor_no': professor_no,
                      'professor_no2': professor_no2,
                      'professor_name': selectedProfessorInfo.교수명
                    }
                  },
                ]
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `660187634311bb7fed54a7ce`,//pro_find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      };
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `올바른 번호를 입력해주세요.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `660187634311bb7fed54a7ce`,//pro_find2
            'extra':{
              'type': 'back_select',
                'userInput': userInput,
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_professor_info_find', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let professor_no;
  let professor_no2;
  let professor_name;
  let response = {};
  if(extra && extra.type === "back_select"){ // pro_info_find로부터 받아온 extra값
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  } else{
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  }
  
  const similarLectures = findSimilarProfessorsNofilter(professor_name, lectureInfo);
  
  if (similarLectures && similarLectures.length > 0) {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `※번호 확인 후 번호 입력 클릭※\n\n과목 - 교수 - 분반 순\n\n${similarLectures.map((lecture, index) => `${index + 1}.${lecture.과목명} ${lecture.교수명} ${lecture.분반}`).join('\n')}\n`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `번호 입력`,
            'blockId': `6609338b4311bb7fed55c7ee`,//pro_info_select
            'extra':{
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `6609341bcdd882158c75c80c`,//pro_select2
            'extra':{
              'type': 'back_info_find',
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `개설된 강의가 없습니다.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `6609341bcdd882158c75c80c`,//pro_select2
            'extra':{
              'type': 'back_info_find',
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_professor_info_select', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput;
  let professor_no;
  let professor_no2;
  let professor_name;
  let response = {};

  if(extra && extra.type === "back_search"){
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  }else{
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = req.body.action.params.professor_no;
    professor_name = extra.professor_name;
  }

  const similarLectures = findSimilarProfessorsNofilter(professor_name, lectureInfo);
  
  if (similarLectures && similarLectures[professor_no2 - 1]) {
    const selectedLecture = similarLectures[professor_no2 - 1];
    
    const selectedLectureInfo = lectureInfo.find(lecture => 
      lecture.과목명 === selectedLecture.과목명 &&
      lecture.교수명 === selectedLecture.교수명 &&
      lecture.분반 === selectedLecture.분반
    );

    if (!selectedLectureInfo) {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": `강의 정보를 찾을 수 없습니다.`
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `66093382eb6af05590a00433`,//find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
                'professor_no': professor_no,
                'professor_no2': professor_no2,
                'professor_name': professor_name
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      }
    } else {
      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "textCard": {
                "title": "선택한 강의",
                "description": `강의명: ${selectedLectureInfo.과목명}\n교수명: ${selectedLectureInfo.교수명}\n분반: ${selectedLectureInfo.분반}`,
                "buttons": [
                  {
                    "action": "block",
                    "label": "강좌 기본정보",
                    "blockId": "6609339eeb6af05590a00437",//pro_info_search
                    "extra": {
                      "menu": "basicInfo",
                      'userInput': userInput,
                      'professor_no': professor_no,
                      'professor_no2': professor_no2,
                      'professor_name': professor_name,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  },
                  {
                    "action": "block",
                    "label": "교과개요",
                    "blockId": "6609339eeb6af05590a00437",//pro_info_search
                    "extra": {
                      "menu": "courseOverview",
                      'userInput': userInput,
                      'professor_no': professor_no,
                      'professor_no2': professor_no2,
                      'professor_name': professor_name,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  },
                  {
                    "action": "block",
                    "label": "평가항목 및 방법",
                    "blockId": "6609339eeb6af05590a00437",//pro_info_search
                    "extra": {
                      "menu": "evaluationMethods",
                      'userInput': userInput,
                      'professor_no': professor_no,
                      'professor_no2': professor_no2,
                      'professor_name': professor_name,
                      'select':{
                        'lectures': selectedLectureInfo.과목명,
                        'professor': selectedLectureInfo.교수명,
                        'classes': selectedLectureInfo.분반
                      }
                    }
                  }
                ]
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': `시간표에 저장`,
              'blockId': `660981bc73a80e4a1e58d2e3`,//schedule_save
              'extra':{
                'save': {
                  'type': "professor",
                  'userInput': userInput,
                  'professor_no': professor_no,
                  'professor_no2': professor_no2,
                  'professor_name': professor_name,
                  'lectures': selectedLectureInfo.과목명,
                  'professor': selectedLectureInfo.교수명,
                  'classes': selectedLectureInfo.분반
                }
              }
            },
            {
              'action': 'block',
              'label': `뒤로가기`,
              'blockId': `66093382eb6af05590a00433`,//pro_info_find2
              'extra':{
                'type': 'back_select',
                'userInput': userInput,
                'professor_no': professor_no,
                'professor_no2': professor_no2,
                'professor_name': professor_name
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      };
    }
  } else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `올바른 번호를 입력해주세요.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로가기`,
            'blockId': `66093382eb6af05590a00433`,//find2
            'extra':{
              'type': 'back_select',
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_professor_info_search', async (req, res) => {
  try {
  const extra = req.body.action.clientExtra;
  let userInput = extra.userInput;
  let professor_no = extra.professor_no;
  let professor_no2 = extra.professor_no2;
  let professor_name = extra.professor_name;
  if(extra && extra.type === "back_search"){
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  } else {
    userInput = extra.userInput;
    professor_no = extra.professor_no;
    professor_no2 = extra.professor_no2;
    professor_name = extra.professor_name;
  }
  const lectures = extra.select.lectures;
  const professor = extra.select.professor;
  const classes = extra.select.classes;
  const selectedLectureInfo = lectureInfo.find(lecture => 
    lecture.과목명 === lectures &&
    lecture.교수명 === professor &&
    lecture.분반 === classes
  );
  const selectedLectureInfo2 = lectureList.find(lecture => 
    lecture.과목명 === lectures &&
    lecture.교수명 === professor &&
    lecture.분반 === classes
  );
  let response = {};

  if (extra && extra.menu === "basicInfo") {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "강좌 기본정보",
              "description": `과목코드: ${selectedLectureInfo2.과목코드}\n과목명: ${selectedLectureInfo2.과목명}\n시간표: ${selectedLectureInfo2.시간표}\n강의실: ${selectedLectureInfo2.강의실}\n교수명: ${selectedLectureInfo.교수명}\n핸드폰: ${selectedLectureInfo.핸드폰}\n이메일: ${selectedLectureInfo.이메일}\n분반: ${selectedLectureInfo.분반}\n성적평가구분: ${selectedLectureInfo.성적평가구분}\n과정구분: ${selectedLectureInfo.과정구분}\n이수구분: ${selectedLectureInfo.이수구분}\n개설학과: ${selectedLectureInfo.개설학과}\n개설학년: ${selectedLectureInfo.개설학년}\n교재 및 참고 문헌: ${selectedLectureInfo['교재 및 참고 문헌']}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `6609338ecdd882158c75c801`,//select2
              'extra':{
                'type': 'back_search',
                'userInput': userInput,
                'professor_no': professor_no,
                'professor_no2': professor_no2,
                'professor_name': professor_name
              }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  else if (extra && extra.menu === "courseOverview") {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "교과개요",
              "description": `교과목개요▼\n ${selectedLectureInfo.교과목개요}\n\n교과목표▼\n ${selectedLectureInfo.교과목표}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `6609338ecdd882158c75c801`,//select2
            'extra':{
              'type': 'back_search',
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "textCard": {
              "title": "평가항목 및 방법",
              "description": `출석▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].출석.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].출석.평가방법_및_주요내용}\n\n중간▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].중간.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].중간.평가방법_및_주요내용}\n\n기말▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].기말.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].기말.평가방법_및_주요내용}\n\n과제▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].과제.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].과제.평가방법_및_주요내용}\n\n기타▼\n 반영비율: ${selectedLectureInfo['평가항목 및 방법'].기타.반영비율}\n 평가방법 및 주요내용: ${selectedLectureInfo['평가항목 및 방법'].기타.평가방법_및_주요내용}\n\n과제개요▼\n 과제주제: ${selectedLectureInfo['평가항목 및 방법'].과제개요.과제주제}\n 분량 : ${selectedLectureInfo['평가항목 및 방법'].과제개요.분량}\n 제출일자: ${selectedLectureInfo['평가항목 및 방법'].과제개요.제출일자}`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `뒤로 가기`,
            'blockId': `6609338ecdd882158c75c801`,//select2
            'extra':{
              'type': 'back_search',
              'userInput': userInput,
              'professor_no': professor_no,
              'professor_no2': professor_no2,
              'professor_name': professor_name
            }
          },
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.post('/lecture_schedule_save', async (req, res) => {
  try {
    const extra = req.body.action.clientExtra;
    const userId = req.body.userRequest.user.id;
    const type = extra.save.type;
    const userInput = extra.save.userInput;
    const lecture_no = extra.save.lecture_no;
    const professor_no = extra.save.professor_no;
    const professor_no2 = extra.save.professor_no2;
    const professor_name = extra.save.professor_name;
    const lectures = extra.save.lectures;
    const professor = extra.save.professor;
    const classes = extra.save.classes;
    const selectedLectureInfo = lectureList.find(lecture => 
      lecture.과목명 === lectures &&
      lecture.교수명 === professor &&
      lecture.분반 === classes
    );
    const time = selectedLectureInfo.시간표;
    const place = selectedLectureInfo.강의실;
    let response;
    let extraSet;
    let blockId;
    let userRow = await findUserRow(userId, auth_global, SPREADSHEET_ID) || await addUserRow(userId, auth_global, SPREADSHEET_ID);
    if (type === "lecture"){
      blockId = "66014fc63190593813f158f6"
      extraSet = {
        'type': 'back_search',
        'userInput': userInput,
        'lecture_no': lecture_no
      }
    } else{
      blockId = "6609338ecdd882158c75c801"
      extraSet = {
        'type': 'back_search',
        'userInput': userInput,
        'professor_no': professor_no,
        'professor_no2': professor_no2,
        'professor_name': professor_name
      }
    }

    const timeIndices = getTimeIndex(time);
    const timeIndex = getColumnIndex(timeIndices);
    const rowData = [lectures+' '+classes+' '+professor+' '+place];

    // 각 열에 대한 읽기 작업을 병렬로 수행
    const columnReadPromises = timeIndex.map(index => readFromGoogleSheets(auth_global, SPREADSHEET_ID, `시간표!${index.toString()}${userRow}`));
    const columnDataArray = await Promise.all(columnReadPromises);

    let overlappingColumnsData = columnDataArray
      .filter(columnData => columnData && columnData.length > 0)
      .map(async (columnData, index) => {
        const columnHeader = await readFromGoogleSheets(auth_global, SPREADSHEET_ID, `시간표!${timeIndex[index].toString()}1`);
        return { index: columnHeader, data: columnData  };
      });

    // 겹치는 열이 하나라도 있으면 해당 데이터 보여주기
    if (overlappingColumnsData.length > 0) {
      let text = "수업시간이 겹치는 강의가 있습니다.\n\n";
      for (const overlappingColumn of overlappingColumnsData) {
        const { index, data } = await overlappingColumn;
        text += `${data.join('')} - ${index}\n`;
      }

      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": text
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': '뒤로가기',
              'blockId': blockId,
              'extra': extraSet
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
              
            }
          ]
        }
      };
    } else {
      // 겹치는 열이 없으면 시간표에 저장
      const ranges = timeIndex.map(index => `시간표!${index.toString()}${userRow}`);
      const rowDataArray = Array(timeIndex.length).fill(rowData);
      await batchWriteToGoogleSheets(auth_global, SPREADSHEET_ID, ranges, rowDataArray);

      response = {
        "version": "2.0",
        "template": {
          "outputs": [
            {
              "simpleText": {
                "text": `해당 강의를 시간표에 저장했습니다.`
              }
            }
          ],
          "quickReplies": [
            {
              'action': 'block',
              'label': '뒤로가기',
              'blockId': blockId,
              'extra':{
                'type': 'back_search',
                'userInput': userInput,
                'lecture_no': lecture_no
              }
            },
            {
              'action': 'message',
              'label': `처음으로`,
              'messageText': `처음으로`
            }
          ]
        }
      };
    }

    res.json(response);
  } catch (error) {
    console.log(error);
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `예기치 않은 응답입니다.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    };
    res.json(response);
  }
});

app.post('/lecture_schedule_edit', async (req, res) => {
  try{
    const userId = req.body.userRequest.user.id;
    let userRow = await findUserRow(userId, auth_global, SPREADSHEET_ID)
    let response;

    if (userRow){
      const rowData = (await readFromGoogleSheets(auth_global, SPREADSHEET_ID, `시간표!B${userRow}:BX${userRow}`))[0];

      if (rowData && rowData.length > 0) {
        const uniqueRowData = removeDuplicatesAndEmpty(rowData);

        const separatedData = uniqueRowData.map(row => row.split(" "));

        const lectures = separatedData.map(data => data[0].replace(/\s+/g, '').toUpperCase());
        const professors = separatedData.map(data => data[1].replace(/\s+/g, '').toUpperCase());
        const classes = separatedData.map(data => data[2]);
        const places = separatedData.map(data => data[3]);
        const selectedLectureInfo = lectureList.filter((lecture, index) => {
          return lecture.과목명 === lectures[index] &&
              lecture.교수명 === professors[index] &&
              lecture.분반 === classes[index] &&
              lecture.강의실 === places[index];
        });
        console.log(selectedLectureInfo);
        const lectureListText = selectedLectureInfo.map(info => `${info.과목명} - ${info.교수명} - ${info.분반} - ${info.강의실} - ${info.시간표}`).join("\n");
        const text = `시간표에 저장된 강의 목록\n\n${lectureListText}`;
        response = {
          "version": "2.0",
          "template": {
            "outputs": [
              {
                "simpleText": {
                  "text": text
                }
              }
            ],
            "quickReplies": [
              {
                'action': 'message',
                'label': `처음으로`,
                'messageText': `처음으로`
              }
            ]
          }
        };
      } else{
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": `시간표에 저장된 강의가 없습니다.`
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'message',
            'label': `처음으로`,
            'messageText': `처음으로`
          }
        ]
      }
    }
  }
  }
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});

app.post('/example', async (req, res) => {
  try{
  let response;
  
  res.json(response);
} catch (error) {
  console.log(error)
  response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "simpleText": {
            "text": `예기치 않은 응답입니다.`
          }
        }
      ],
      "quickReplies": [
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
        }
      ]
    }
  }
  res.json(response);
}
});