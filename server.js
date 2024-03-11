const express = require('express');
const fs = require('fs');
const schedule = require('node-schedule');
const { main_met } = require('./crawl_metropole');
const { main_met_dorm } = require('./crawl_metropole_dormitory');
const app = express();
const port = 8080;
let mealMetropole;
let mealMetropoleDormitory;
app.use(express.json());
//app.use(express.static(__dirname));
function createMealCard(title, description, buttons) {
  return {
    'textCard': {
      'title': title,
      'description': description,
      'buttons': buttons
    }
  };
}

function createActionButton(label, messageText) {
  return {
    'action': 'message',
    'label': label,
    'messageText': messageText
  };
}

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
    }
  }
  else {
    response = {
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "carousel": {
              "type": "listCard",
              "items": [
                {
                  "header": {
                    "title": "오늘의 학식 - 양주 캠퍼스"
                  },
                  "items": [
                    {
                      "title": "한정식[학생식당]",
                      "description": `${todayMealMetropole.meal}`,
                    },
                    {
                      "title": "조식[기숙사]",
                      "description": `${todayMealMetropoleDormitory.breakfast}`,
                    },
                    {
                      "title": "석식[기숙사]",
                      "description": `${todayMealMetropoleDormitory.dinner}`,
                    },
                  ],
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

app.post('/week', async (req, res) => {
  const daysOfWeek = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  const weekMeals = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setDate(day.getDate() + i);
    const dayOfWeek = daysOfWeek[day.getDay()];

    const todayMealMetropole = mealMetropole.data.find(item => item.date === dayOfWeek);
    const todayMealMetropoleDormitory = mealMetropoleDormitory.data.find(item => item.date === dayOfWeek);

    const fridayMessage = "금, 토, 일에는 제공되지 않습니다.";

    // 토요일과 일요일 제외 처리
    if (i === 5 || i === 6) {
      continue;
    }

    weekMeals.push({
      "header": {
        "title": `이번주 학식 - ${dayOfWeek}`
      },
      "items": [
        {
          "title": "한정식[학생식당]",
          "description": `${todayMealMetropole.meal}`,
        },
        {
          "title": "조식[기숙사]",
          "description": i === 5 ? fridayMessage : `${todayMealMetropoleDormitory.breakfast}`,
        },
        {
          "title": "석식[기숙사]",
          "description": i === 5 ? fridayMessage : `${todayMealMetropoleDormitory.dinner}`,
        }
      ],
      "buttons": [
        {
          'action': 'block',
          'label': `원산지 확인`,
          'blockId': `65ee6281e88704127f3d8446`
        },
        {
          'action': 'message',
          'label': `처음으로`,
          'messageText': `처음으로`
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
            "type": "listCard",
            "items": weekMeals
          }
        }
      ]
    }
  };

  res.json(response);
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});