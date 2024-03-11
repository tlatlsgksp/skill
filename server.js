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

  const response = {
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
                    "title": "한정식",
                    "description": `${todayMealMetropole.meal.replace(/ /g, '\n')}`,
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
              },
              {
                "header": {
                  "title": "오늘의 학식 - 양주 캠퍼스 기숙사"
                },
                "items": [
                  {
                    "title": "조식",
                    "description": `${todayMealMetropoleDormitory.breakfast.replace(/ /g, '\n')}`,
                  },
                  {
                    "title": "석식",
                    "description": `${todayMealMetropoleDormitory.dinner.replace(/ /g, '\n')}`,
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
  res.json(response);


      /*'version': '2.0',
      'template': {
        'outputs': [
          createMealCard(`오늘의 학식[${todayMealMetropole.date}] - 양주 캠퍼스`, `한정식: ${todayMealMetropole.meal}`, [
            createActionButton('원산지 확인', `오늘의 학식[원산지] - 양주 캠퍼스`),
            createActionButton('처음으로', '처음으로'),
            createActionButton('뒤로가기', '뒤로가기')
          ]), 
          createMealCard(`오늘의 학식[${todayMealMetropoleDormitory.date}] - 양주 캠퍼스 기숙사`, `조식: ${todayMealMetropoleDormitory.breakfast}\n석식: ${todayMealMetropoleDormitory.dinner}`, [
            createActionButton('원산지 확인', `오늘의 학식[원산지] - 양주 캠퍼스 기숙사`),
            createActionButton('처음으로', '처음으로'),
            createActionButton('뒤로가기', '뒤로가기')
          ])
        ]
      }
    };
    res.json(response);*/
});

app.post('/week', async (req, res) => {
  const response = {
    'version': '2.0',
    'template': {
      'outputs': [
        createMealCard(`이번주 학식[] - 양주 캠퍼스`, `한정식: `, [
          createActionButton('원산지 확인', `이번주 학식[원산지] - 양주 캠퍼스`),
          createActionButton('처음으로', '처음으로'),
          createActionButton('뒤로가기', '뒤로가기')
        ]), 
        createMealCard(`이번주 학식[] - 양주 캠퍼스 기숙사`, `조식: \n석식: `, [
          createActionButton('원산지 확인', `이번주 학식[원산지] - 양주 캠퍼스 기숙사`),
          createActionButton('처음으로', '처음으로'),
          createActionButton('뒤로가기', '뒤로가기')
        ])
      ]
    }
  };
  res.json(response);
  
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
});