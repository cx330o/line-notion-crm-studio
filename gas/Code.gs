// Googleフォーム送信時のメイン処理
function onFormSubmit(e) {
  try {
    Logger.log('onFormSubmit triggered');
    const formData = parseFormData(e);
    Logger.log('Parsed formData: %s', JSON.stringify(formData));
    // デコード済みUIDをformDataに追加
    formData.uid = decodeUid(formData.base64uid);
    Logger.log('Decoded UID: %s', formData.uid);
    let customer = null;
    if (formData.uid) {
      customer = searchCustomerByUid(formData.uid);
      Logger.log('Customer search by UID result: %s', JSON.stringify(customer));
    }
    if (!customer && formData.tel) {
      customer = searchCustomerByPhone(formData.tel);
      Logger.log('Customer search by Phone result: %s', JSON.stringify(customer));
    }
    if (!customer) {
      customer = createCustomer(formData);
      Logger.log('Customer created: %s', JSON.stringify(customer));
    } else {
      updateCustomer(customer.id, formData);
      Logger.log('Customer updated: %s', customer.id);
    }
    // 案件作成
    const caseRes = createCase(formData, customer.id);
    Logger.log('Case created for customerId: %s', customer.id);
    // 案件IDプロパティ値を取得
    const caseId = caseRes && caseRes.caseId ? caseRes.caseId : null;
    // メール送信
    if (formData.email && caseId) {
      sendCustomerMail(formData, caseId);
    }
  } catch (err) {
    Logger.log('Error in onFormSubmit: %s', err && err.message ? err.message : err);
    notifySlack("GASエラー: " + (err && err.message ? err.message : err));
  }
}

// フォームデータのパース（必要に応じて実装）
function parseFormData(e) {
  Logger.log('parseFormData called');
  // e.namedValues などから必要な値を抽出して返す
  // 例: { base64uid: ..., name: ..., ... }
  return {
    timestamp: e.namedValues["タイムスタンプ"] ? e.namedValues["タイムスタンプ"][0] : "",
    email: e.namedValues["メールアドレス"] ? e.namedValues["メールアドレス"][0] : "",
    name: e.namedValues["名前"] ? e.namedValues["名前"][0] : "",
    furigana: e.namedValues["フリガナ"] ? e.namedValues["フリガナ"][0] : "",
    tel: e.namedValues["電話番号"] ? e.namedValues["電話番号"][0] : "",
    birthday: e.namedValues["生年月日"] ? e.namedValues["生年月日"][0] : "",
    photoType: e.namedValues["撮影種別"] ? e.namedValues["撮影種別"][0] : "",
    detail: e.namedValues["問い合わせ内容・詳細"] ? e.namedValues["問い合わせ内容・詳細"][0] : "",
    image1: e.namedValues["参考画像1"] ? e.namedValues["参考画像1"][0] : "",
    image2: e.namedValues["参考画像2"] ? e.namedValues["参考画像2"][0] : "",
    image3: e.namedValues["参考画像3"] ? e.namedValues["参考画像3"][0] : "",
    base64uid: e.namedValues["LINE_UID"] ? e.namedValues["LINE_UID"][0] : "",
    reserve1: e.namedValues["予約日時候補1"] ? e.namedValues["予約日時候補1"][0] : "",
    reserve2: e.namedValues["予約日時候補2"] ? e.namedValues["予約日時候補2"][0] : "",
    reserve3: e.namedValues["予約日時候補3"] ? e.namedValues["予約日時候補3"][0] : "",
  };
}

// UIDのbase64デコード
function decodeUid(base64uid) {
  Logger.log('decodeUid called with: %s', base64uid);
  return Utilities.newBlob(Utilities.base64Decode(base64uid)).getDataAsString();
}

// 顧客向けメール送信
function sendCustomerMail(formData, caseId) {
  const subject = "【ITS写真館】ご注文（お問い合わせ）受付のお知らせ";
  const body = `${formData.name} 様\n\nこの度はご注文（お問い合わせ）ありがとうございます。\n受付内容は下記の通りです。\n\n案件ID: ${caseId}\nお名前: ${formData.name}\nメールアドレス: ${formData.email}\n電話番号: ${formData.tel}\n撮影種別: ${formData.photoType}\nご希望日時1: ${formData.reserve1}\nご希望日時2: ${formData.reserve2}\nご希望日時3: ${formData.reserve3}\nお問い合わせ内容: ${formData.detail}\n\n今後のお問い合わせの際は「案件ID」をお伝えください。\n\nITS写真館`;
  MailApp.sendEmail({
    to: formData.email,
    subject: subject,
    body: body
  });
}

