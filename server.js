const express = require('express');
const fs = require('fs');
const schedule = require('node-schedule');
const { main_met } = require('./crawl_metropole');
const { main_met_dorm } = require('./crawl_metropole_dormitory');
const { main_lecturelist } = require('./load_lecturelist');
const app = express();
const port = 8080;
let mealMetropole;
let mealMetropoleDormitory;
let lectureList;
let serverInitialized = false;
app.use(express.json());
app.use(express.static(__dirname));


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
      return i + 1;
    }
  }

  return null;
}

//현재 빈 강의실 추출
function findAvailableClassrooms(lectureList) {
  const today = gettoDay();
  const currentClass = getCurrentClass();
  const availableClassrooms = [];

  for (const lectureKey in lectureList) {
    const lecture = lectureList[lectureKey];
    
    if (lecture.hasOwnProperty("시간표") && lecture.hasOwnProperty("캠퍼스")) {
      const classTime = lecture["시간표"];
      
      if (classTime !== "" && classTime.includes(today) && currentClass && !classTime.includes(currentClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        availableClassrooms.push(lecture["강의실"]);
      }
    }
    else {
      console.log("Lecture does not have '시간표' or '캠퍼스' property:", lecture);
    }
  }

  return availableClassrooms;
}

//다음 교시 빈 강의실 추출
function findAvailableClassroomsNext(lectureList) {
  const today = gettoDay();
  const nextClass = getCurrentClass() + 1;
  const availableClassrooms = [];

  for (const lectureKey in lectureList) {
    const lecture = lectureList[lectureKey];

    if (lecture.hasOwnProperty("시간표")) {
      const classTime = lecture["시간표"];

      if (classTime !== "" && classTime.includes(today) && nextClass && !classTime.includes(nextClass.toString()) && lecture["캠퍼스"] === "메트로폴") {
        availableClassrooms.push(lecture["강의실"]);
      }
    }
    else {
      console.log("Lecture does not have '시간표' property:", lecture);
    }
  }

  return availableClassrooms;
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${currentClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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
        description: `${getFloorLabel(floor)}▼\n(${uniqueClassrooms.join(', ')})\n※${nextClass}교시 기준※`,
        buttons: [
          {
            'action': 'message',
            'label': `-`,
            'messageText': `-`
          },
      ]
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

//서버 초기화
async function initialize() {
  try {
    console.log('서버 초기화 중');
    await main_met();
    await main_met_dorm();
    await main_lecturelist();
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
    await main_lecturekist();
    fs.readFile('./lecturelist.json', 'utf8', (err, data) => {
      if (err) throw err;
      mealMetropoleDormitory = JSON.parse(data);
    });
    res.json({ message: '데이터가 업데이트되었습니다.' });
  } catch (error) {
    console.error('Error during update:', error.message);
    res.status(500).json({ error: '업데이트 중 오류가 발생했습니다.' });
  }
});

//오늘의 학식 - 학생식당, 기숙사
app.post('/today', (req, res) => {
  const day = new Date();
  const today = day.getDay();
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
                    "title": "🍴오늘의 학식[학생식당]🍴",
                    "description": `한정식▼\n${todayMealMetropole.meal}`,
                    "buttons": [
                      {
                        'action': 'message',
                        'label': `-`,
                        'messageText': `-`
                      },
                  ]
                },
                {
                  "title": "🍴오늘의 학식[기숙사]🍴",
                  "description": `조식▼\n${todayMealMetropoleDormitory.breakfast}\n\n석식▼\n${todayMealMetropoleDormitory.dinner}`,
                  "buttons": [
                    {
                      'action': 'message',
                      'label': `-`,
                      'messageText': `-`
                    },
                ]
              }
              ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ed16f940d33a5902c955aa`
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
});

//내일의 학식 - 학생식당, 기숙사
app.post('/tomorrow', (req, res) => {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const tomorrow = day.getDay();
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
        ]
        ,
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
                        'action': 'message',
                        'label': `-`,
                        'messageText': `-`
                      },
                  ]
                },
                {
                  "title": "🍴내일의 학식[기숙사]🍴",
                  "description": `조식▼\n${tomorrowMealMetropoleDormitory.breakfast}\n\n석식▼\n${tomorrowMealMetropoleDormitory.dinner}`,
                  "buttons": [
                    {
                      'action': 'message',
                      'label': `-`,
                      'messageText': `-`
                    },
                ]
              }
              ]
            }
          }
        ],
        "quickReplies": [
          {
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ee8171d287ba103c2cd6ac`
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
});

//오늘의 학식 - 원산지
app.post('/today_origin', (req, res) => {
  const day = new Date();
  const today = day.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[today];
  const todayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

  const response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "carousel": {
              "type": "textCard",
              "items": [
                {
                  "title": "🍴오늘의 학식[학생식당] - 원산지🍴",
                  "description": `${todayMealMetropole.origin}`,
                  "buttons": [
                    {
                      'action': 'message',
                      'label': `-`,
                      'messageText': `-`
                    },
                ]
                },
                {
                  "title": "🍴오늘의 학식[기숙사] - 원산지🍴",
                  "description": `${todayMealMetropoleDormitory.origin}`,
                  "buttons": [
                    {
                      'action': 'message',
                      'label': `-`,
                      'messageText': `-`
                    },
                ]
                },
              ]
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

  res.json(response);
});

//내일의 학식 - 원산지
app.post('/tomorrow_origin', (req, res) => {
  const day = new Date();
  day.setDate(day.getDate() + 1);
  const tomorrow = day.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[tomorrow];
  const tomorrowMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const tomorrowMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

  const response = {
    "version": "2.0",
    "template": {
      "outputs": [
        {
          "carousel": {
            "type": "textCard",
            "items": [
              {
                "title": "🍴내일의 학식[학생식당] - 원산지🍴",
                "description": `${tomorrowMealMetropole.origin}`,
                "buttons": [
                  {
                    'action': 'message',
                    'label': `-`,
                    'messageText': `-`
                  },
              ]
              },
              {
                "title": "🍴내일의 학식[기숙사] - 원산지🍴",
                "description": `${tomorrowMealMetropoleDormitory.origin}`,
                "buttons": [
                  {
                    'action': 'message',
                    'label': `-`,
                    'messageText': `-`
                  },
              ]
              },
            ]
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

res.json(response);
});

//이번주 학식 - 학생식당, 기숙사
app.post('/week', (req, res) => {
  const day = new Date();
  const today = day.getDay();
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const targetDay = daysOfWeek[today];
  const todayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
  const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

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
});

//이번주 학식 - 학생식당
app.post('/week_met', async (req, res) => {
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
            'action': 'message',
            'label': `-`,
            'messageText': `-`
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
          'label': `원산지 확인`,
          'blockId': `65ee6281e88704127f3d8446`
        },
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
});

//이번주 학식 - 기숙사
app.post('/week_met_dorm', async (req, res) => {
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
            'action': 'message',
            'label': `-`,
            'messageText': `-`
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
          'label': `원산지 확인`,
          'blockId': `65ee9fa1693153232294d2a5`
        },
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
});

//이번주 학식 = 학생식당 원산지
app.post('/week_met_origin', async (req, res) => {

  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const weekMeals = [];
  for (let i = 0; i < 7; i++) {
    const targetDay = daysOfWeek[i];
    const tagetdayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
    const tagetdayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

    if (i === 0 || i === 6) {
      continue;
    }

    weekMeals.push({
      "title": `🍴${daysOfWeek[i]} 학식[학생식당] - 원산지🍴`,
      "description": `${tagetdayMealMetropole.origin}`,
      "buttons": [
        {
          'action': 'message',
          'label': `-`,
          'messageText': `-`
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
            "items": weekMeals,
            "buttons": [
              {
                'action': 'message',
                'label': `-`,
                'messageText': `-`
              },
          ]
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
});

//이번주 학식 = 기숙사 원산지
app.post('/week_met_dorm_origin', async (req, res) => {
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const weekMeals = [];
  for (let i = 0; i < 7; i++) {
    const targetDay = daysOfWeek[i];
    const tagetdayMealMetropole = mealMetropole.data.find(item => item.date === targetDay);
    const tagetdayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === targetDay);

    if (i === 0 || i === 5 || i === 6) {
      continue;
    }

    weekMeals.push({
      "title": `🍴${daysOfWeek[i]} 학식[기숙사] - 원산지🍴`,
      "description": `${tagetdayMealMetropoleDormitory.origin}`,
      "buttons": [
        {
          'action': 'message',
          'label': `-`,
          'messageText': `-`
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
            "items": weekMeals,
            "buttons": [
              {
                'action': 'message',
                'label': `-`,
                'messageText': `-`
              },
          ]
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
});

//빈 강의실 찾기
app.post('/lecture_find', async (req, res) => {
  const day = new Date();
  const today = day.getDay();

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
});

//현재 빈 강의실 - 우당관
app.post('/empty_lecture_now_1', async (req, res) => {
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

  const response = createBuildingResponse_1('우당관', buildingCode, sortedFloors, false);
  res.json(response);
});

//현재 빈 강의실 - 선덕관
app.post('/empty_lecture_now_2', async (req, res) => {
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

  const response = createBuildingResponse_2('선덕관', buildingCode, sortedFloors, false);
  res.json(response);
});

//현재 빈 강의실 - 충효관
app.post('/empty_lecture_now_3', async (req, res) => {
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

  const response = createBuildingResponse_3('충효관', buildingCode, sortedFloors, false);
  res.json(response);
});

//다음 교시 빈 강의실 - 우당관
app.post('/empty_lecture_next_1', async (req, res) => {
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

  const response = createBuildingResponseNext_1('우당관', buildingCode, sortedFloors, false);
  res.json(response);
});

//다음 교시 빈 강의실 - 선덕관
app.post('/empty_lecture_next_2', async (req, res) => {
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

  const response = createBuildingResponseNext_2('선덕관', buildingCode, sortedFloors, false);
  res.json(response);
});

//다음 교시 빈 강의실 - 충효관
app.post('/empty_lecture_next_3', async (req, res) => {
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

  const response = createBuildingResponseNext_3('충효관', buildingCode, sortedFloors, false);
  res.json(response);
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});