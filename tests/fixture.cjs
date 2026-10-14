const Core = require('../apps-script/Core.js');
function fixture(type = 'E') {
  const item = (id,kind,title,extra = {}) => ({id,kind,title,help:'',required:true,graded:false,...extra});
  const form = {type,title:'承攬商安全衛生教育訓練',subtitle:type === 'E' ? '工程發包類型承攬商專用版' : '勞務類型承攬商專用版',sections:[
    {title:'基本資料',description:'請填寫基本資料',items:[
      item('1','checkbox','個人資料提供同意書',{options:['我同意']}),
      item('2','text','公司統編'),item('3','text','身分證字號'),item('4','text','姓名'),item('5','text','公司名稱')
    ]},
    {title:'訓練教材',description:'請觀看影片',items:[
      item('6','date','觀看教材日期'),item('7','video','安全訓練影片',{required:false,youtubeId:'8A8QaiF10XM'}),
      item('8','radio','是否完整觀看教材？',{options:['是','否']}),item('9','radio','是否準備相關文件？',{options:['否','是']})
    ]},
    {title:'測驗',description:'全部答對才能發證',items:[
      item('10','radio','進場應遵守施工規範？',{options:['正確','錯誤'],graded:true,points:50,correct:['正確']}),
      item('11','radio','可以忽略現場警示？',{options:['正確','錯誤'],graded:true,points:50,correct:['錯誤']})
    ]}
  ]};
  Core.itemsOf(form).forEach(i => {i.role = Core.roleOf(i);});
  return form;
}
const answers = {'1':['我同意'],'2':'24536806','3':'A123456789','4':'王小明','5':'測試工程公司','6':'2026-10-14','8':'是','9':'是','10':'正確','11':'錯誤'};
const cert = {certNo:'RT-E-20261014-001',token:'abcdefghijklmnop',type:'E',company:'測試工程公司',name:'王小明',maskedId:'A12****789',issuedAt:'2026-10-14T14:30:00.000+08:00',expiresOn:'2027-10-14',status:'valid'};
module.exports = {fixture,answers,cert};
