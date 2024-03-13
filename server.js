const express = require('express');
const fs = require('fs');
const schedule = require('node-schedule');
const { main_met } = require('./crawl_metropole');
const { main_met_dorm } = require('./crawl_metropole_dormitory');
const app = express();
const port = 8080;
let mealMetropole;
let mealMetropoleDormitory;
let serverInitialized = false;
app.use(express.json());
//app.use(express.static(__dirname));

const mondaySchedule = schedule.scheduleJob({ dayOfWeek: 1, hour: 6, minute: 0 }, async function() {
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

async function initialize() {
  try {
    console.log('서버 초기화 중');
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
    console.log('서버 초기화 완료');
    serverInitialized = true;
  } catch (error) {
    console.error('Error during initialization:', error.message);
  }
}

initialize();

app.get('/', (req, res) => {
  res.send('서버가 실행 중입니다.');
});

app.get('/keyboard', (req, res) => {
  const data = { 'type': 'text' }
  res.json(data);
});

app.use((req, res, next) => {
  if (!serverInitialized) {
    res.status(503).send('서버 초기화 중입니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  next();
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
              "description": "학식이 제공되지않습니다.",
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
                      {
                        'action': 'message',
                        'label': `처음으로`,
                        'messageText': `처음으로`
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
                      'blockId': `65ee9f1fac1dbb67bfcf55d0`
                    },
                    {
                      'action': 'message',
                      'label': `처음으로`,
                      'messageText': `처음으로`
                    },
                ]
              }
              ]
            }
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
                      {
                        'action': 'message',
                        'label': `처음으로`,
                        'messageText': `처음으로`
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
                      'blockId': `65eea19f18f53f3111d6f432`
                    },
                    {
                      'action': 'message',
                      'label': `처음으로`,
                      'messageText': `처음으로`
                    },
                ]
              }
              ]
            }
          }
        ]
      }
    };
  }

  res.json(response);
});

//오늘의 학식 - 학생식당 원산지
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
            "textCard": {
              "title": "🍴오늘의 학식[학생식당] - 원산지🍴",
              "description": `${todayMealMetropole.origin}`,
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ca1b7109dcef4315f12fd3`
                },
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
    };

  res.json(response);
});

//오늘의 학식 - 기숙사 원산지
app.post('/today_origin_dorm', (req, res) => {
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
              "title": "🍴오늘의 학식[기숙사] - 원산지🍴",
              "description": `${todayMealMetropoleDormitory.origin}`,
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ca1b7109dcef4315f12fd3`
                },
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
    };

  res.json(response);
});

//내일의 학식 - 학생식당 원산지
app.post('/tomorrow_met_origin', (req, res) => {
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
            "textCard": {
              "title": "🍴내일의 학식[학생식당] - 원산지🍴",
              "description": `${tomorrowMealMetropole.origin}`,
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ee8168c8612a194feaff1d`
                },
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
    };

  res.json(response);
});

//내일의 학식 - 기숙사 원산지
app.post('/tomorrow_met_dorm_origin', (req, res) => {
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
            "textCard": {
              "title": "🍴내일의 학식[기숙사] - 원산지🍴",
              "description": `${tomorrowMealMetropoleDormitory.origin}`,
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ee8168c8612a194feaff1d`
                },
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
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ee6281e88704127f3d8446`,
            'extra': {
              'met_day' : `${dayOfWeek}`
            }
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
            'action': 'block',
            'label': `원산지 확인`,
            'blockId': `65ee9fa1693153232294d2a5`,
            'extra': {
              'met_dorm_day' : `${dayOfWeek}`
            }
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
      ]
    }
  };

  res.json(response);
});

app.post('/week_met_origin', async (req, res) => {
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
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ee8c4499eaa8487e2a54df`
                },
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
    };
  res.json(response);
  }
});

app.post('/week_met_dorm_origin', async (req, res) => {
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
              "buttons": [
                {
                  'action': 'block',
                  'label': `뒤로가기`,
                  'blockId': `65ee8c9b5f95a271a0afa67d`
                },
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
    };
  res.json(response);
  }
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});