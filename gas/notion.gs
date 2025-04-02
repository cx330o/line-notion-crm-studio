// Notion API連携ヘルパー

function searchCustomerByUid(uid) {
  // 空文字・null・undefinedなら検索しない
  if (!uid) return null;
  const dbId = PropertiesService.getScriptProperties().getProperty('CUSTOMER_DB_ID');
  const url = 'https://api.notion.com/v1/databases/' + dbId + '/query';
  const payload = {
    filter: {
      property: 'LINE_UID',
      rich_text: { equals: uid }
    }
  };
  const res = notionApiRequest(url, 'post', payload);
  if (res && res.results && res.results.length > 0) {
    // 厳密にLINE_UIDが一致のだけ返す
    for (const page of res.results) {
      const lineUidProp = page.properties['LINE_UID'];
      if (
        lineUidProp &&
        lineUidProp.rich_text &&
        lineUidProp.rich_text.length > 0 &&
        lineUidProp.rich_text[0].plain_text === uid
      ) {
        return { id: page.id };
      }
    };
  }
  return null;
}

function searchCustomerByPhone(phone) {
  if (!phone) return null;
  const dbId = PropertiesService.getScriptProperties().getProperty('CUSTOMER_DB_ID');
  const url = 'https://api.notion.com/v1/databases/' + dbId + '/query';
  const payload = {
    filter: {
      property: '電話番号',
      phone_number: { equals: phone }
    }
  };
  const res = notionApiRequest(url, 'post', payload);
  if (res && res.results && res.results.length > 0) {
    // 厳密に電話番号が一致のだけ返す
    for (const page of res.results) {
      const telProp = page.properties['電話番号'];
      if (
        telProp &&
        telProp.phone_number === phone
      ) {
        return { id: page.id };
      }
    }
  }
  return null;
}

function toNotionDate(str) {
  if (!str) return undefined;
  // 例: "2025/06/10 12:00:00" → "2025-06-10T12:00:00+09:00"
  var d = str.replace(/\//g, '-').replace(' ', 'T');
  // 時刻部分が1桁の場合ゼロ埋め
  d = d.replace(/T(\d):/, function(_, h) { return 'T0' + h + ':'; });
  // すでにタイムゾーンが付いていなければ+09:00を付与
  if (!d.match(/([+-][0-9]{2}:[0-9]{2}|Z)$/)) {
    d += '+09:00';
  }
  return d;
}

function createCustomer(data) {
  const dbId = PropertiesService.getScriptProperties().getProperty('CUSTOMER_DB_ID');
  const url = 'https://api.notion.com/v1/pages';
  const payload = {
    parent: { database_id: dbId },
    properties: {
      '名前': { title: [{ text: { content: data.name } }] },
      'フリガナ': data.furigana ? { rich_text: [{ text: { content: data.furigana } }] } : undefined,
      '電話番号': data.tel ? { phone_number: data.tel } : undefined,
      'メールアドレス': data.email ? { email: data.email } : undefined,
      '生年月日': data.birthday ? { date: { start: toNotionDate(data.birthday) } } : undefined,
      'LINE_UID': { rich_text: [{ text: { content: data.uid } }] },
      'LINE友達ブロック': { checkbox: false },
      'LINEニックネーム': data.displayName ? { rich_text: [{ text: { content: data.displayName } }] } : undefined,
      'LINEプロフィール画像': data.pictureUrl ? { url: data.pictureUrl } : undefined,
      // 必要に応じて他のプロパティも追加
    }
  };
  // undefinedプロパティを除去
  Object.keys(payload.properties).forEach(function(key){
    if(payload.properties[key] === undefined) delete payload.properties[key];
  });
  const res = notionApiRequest(url, 'post', payload);
  Logger.log('Notion createCustomer response: %s', JSON.stringify(res));
  return res ? { id: res.id } : null;
}

function updateCustomer(id, data) {
  const url = 'https://api.notion.com/v1/pages/' + id;
  const props = {};
  if (data.name !== undefined) {
    props['名前'] = { title: [{ text: { content: data.name } }] };
  }
  if (data.furigana !== undefined) {
    props['フリガナ'] = { rich_text: [{ text: { content: data.furigana } }] };
  }
  if (data.tel !== undefined) {
    props['電話番号'] = { phone_number: data.tel };
  }
  if (data.email !== undefined) {
    props['メールアドレス'] = { email: data.email };
  }
  if (data.birthday !== undefined) {
    props['生年月日'] = { date: { start: toNotionDate(data.birthday) } };
  }
  if (data.uid !== undefined) {
    props['LINE_UID'] = { rich_text: [{ text: { content: data.uid } }] };
  }
  if (data.lineBlocked !== undefined) {
    props['LINE友達ブロック'] = { checkbox: !!data.lineBlocked };
  }
  if (data.displayName !== undefined) {
    props['LINEニックネーム'] = { rich_text: [{ text: { content: data.displayName } }] };
  }
  if (data.pictureUrl !== undefined) {
    props['LINEプロフィール画像'] = { url: data.pictureUrl };
  }
  // 必要に応じて他のプロパティも追加
  const payload = { properties: props };
  notionApiRequest(url, 'patch', payload);
}

function createCase(data, customerId) {
  const dbId = PropertiesService.getScriptProperties().getProperty('CASE_DB_ID');
  const url = 'https://api.notion.com/v1/pages';
  // 案件名: YYYYMMDD_名前
  const date = Utilities.formatDate(new Date(data.timestamp), 'Asia/Tokyo', 'yyyyMMdd');
  const caseName = date + '_' + data.name;
  const payload = {
    parent: { database_id: dbId },
    properties: {
      '案件名': { title: [{ text: { content: caseName } }] },
      '主顧客': { relation: [{ id: customerId }] },
      '撮影種別': data.photoType ? { select: { name: data.photoType } } : undefined,
      '問い合わせ内容・詳細': data.detail ? { rich_text: [{ text: { content: data.detail } }] } : undefined,
      '参考画像1': data.image1 ? { url: data.image1 } : undefined,
      '参考画像2': data.image2 ? { url: data.image2 } : undefined,
      '参考画像3': data.image3 ? { url: data.image3 } : undefined,
      '予約日時候補1': data.reserve1 ? { date: { start: toNotionDate(data.reserve1) } } : undefined,
      '予約日時候補2': data.reserve2 ? { date: { start: toNotionDate(data.reserve2) } } : undefined,
      '予約日時候補3': data.reserve3 ? { date: { start: toNotionDate(data.reserve3) } } : undefined,
      // 必要に応じて他のプロパティも追加
    }
  };
  // undefinedプロパティを除去
  Object.keys(payload.properties).forEach(function(key){
    if(payload.properties[key] === undefined) delete payload.properties[key];
  });
  const res = notionApiRequest(url, 'post', payload);
  Logger.log('Notion createCase response: %s', JSON.stringify(res));
  // 案件IDプロパティ値を取得
  let caseId = null;
  if (res && res.properties && res.properties['ID'] && res.properties['ID'].rich_text && res.properties['ID'].rich_text.length > 0) {
    caseId = res.properties['ID'].rich_text[0].plain_text;
  }
  return { id: res ? res.id : null, caseId: caseId };
}

function notionApiRequest(url, method, payload) {
  const notionToken = PropertiesService.getScriptProperties().getProperty('NOTION_TOKEN');
  const options = {
    method: method,
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + notionToken,
      'Notion-Version': '2022-06-28'
    },
    muteHttpExceptions: true
  };
  if (payload) options.payload = JSON.stringify(payload);
  Logger.log('Notion API Request: %s %s\nPayload: %s', method, url, payload ? JSON.stringify(payload) : '');
  const res = UrlFetchApp.fetch(url, options);
  Logger.log('Notion API Response: %s', res.getContentText());
  return JSON.parse(res.getContentText());
} 
