// LINE Webhook受信・署名検証・友だち追加/ブロック対応
function doPost(e) {
	// Logger.log(JSON.stringify(e));

	try {
		Logger.log('doPost called');
		Logger.log('e: %s', e);

		// 1) トークン検証 --------------------------------------------------
		const token = e?.parameter?.access_token || ''; // クエリ単一値
		const expected =
			PropertiesService.getScriptProperties().getProperty(
				'WEBHOOK_ACCESS_TOKEN'
			) || '';

		if (token !== expected) {
			console.log('invalid access_token'); // Cloud Logging に残す
			return ContentService.createTextOutput('403'); // 403 で即終了
		}

		const body = JSON.parse(e.postData.contents);
		Logger.log('Parsed body: %s', JSON.stringify(body));
		const events = body.events || [];
		Logger.log('Events count: %s', events.length);
		events.forEach(function (event) {
			Logger.log('Event: %s', JSON.stringify(event));
			if (event.type === 'follow') {
				handleFollowEvent(event);
			} else if (event.type === 'unfollow') {
				handleUnfollowEvent(event);
			}
		});
		Logger.log('doPost finished normally');
		return ContentService.createTextOutput('ok').setMimeType(
			ContentService.MimeType.TEXT
		);
	} catch (err) {
		Logger.log(
			'Error in doPost: %s',
			err && err.message ? err.message : err
		);
		notifySlack(
			'Webhookエラー: ' + (err && err.message ? err.message : err)
		);
		return ContentService.createTextOutput('error').setMimeType(
			ContentService.MimeType.TEXT
		);
	}
}

function isValidLineSignature(e) {
	const signature =
		e.headers['X-Line-Signature'] || e.headers['x-line-signature'] || '';
	const channelSecret =
		PropertiesService.getScriptProperties().getProperty(
			'LINE_CHANNEL_SECRET'
		) || '';
	const contents = e.postData.contents || '';

	const computed = Utilities.base64Encode(
		Utilities.computeHmacSha256Signature(contents, channelSecret)
	);

	Logger.log('Signature: %s, Computed: %s', signature, computed);
	return signature === computed;
}

// LINEプロフィール取得
function getLineUserProfile(uid) {
	try {
		const accessToken = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN');
		const url = 'https://api.line.me/v2/bot/profile/' + encodeURIComponent(uid);
		const options = {
			method: 'get',
			headers: {
				'Authorization': 'Bearer ' + accessToken,
			},
			muteHttpExceptions: true,
		};
		const response = UrlFetchApp.fetch(url, options);
		if (response.getResponseCode() === 200) {
			return JSON.parse(response.getContentText());
		} else {
			Logger.log('getLineUserProfile error: ' + response.getContentText());
			notifySlack('LINEプロフィール取得失敗: ' + response.getContentText());
			return null;
		}
	} catch (e) {
		Logger.log('getLineUserProfile exception: ' + e);
		notifySlack('LINEプロフィール取得例外: ' + e);
		return null;
	}
}

function handleFollowEvent(event) {
	Logger.log('handleFollowEvent called: %s', JSON.stringify(event));
	const uid = event.source && event.source.userId;
	Logger.log('Follow UID: %s', uid);
	if (!uid) return;

	// LINEプロフィール取得
	const profile = getLineUserProfile(uid);
	const displayName = profile && profile.displayName ? profile.displayName : '';
	const pictureUrl = profile && profile.pictureUrl ? profile.pictureUrl : '';

	const customer = searchCustomerByUid(uid);
	Logger.log('Follow searchCustomerByUid result: %s', JSON.stringify(customer));
	if (!customer) {
		Logger.log('Creating new customer for follow');
		const res = createCustomer({
			uid: uid,
			name: displayName,
			displayName: displayName,
			pictureUrl: pictureUrl,
			lineBlocked: false
		});
		Logger.log('createCustomer response: %s', JSON.stringify(res));
	} else {
		Logger.log('Updating customer for follow');
		const res = updateCustomer(customer.id, {
			uid: uid,
			name: displayName,
			displayName: displayName,
			pictureUrl: pictureUrl,
			lineBlocked: false
		});
		Logger.log('updateCustomer response: %s', JSON.stringify(res));
	}
	return;
}

function handleUnfollowEvent(event) {
	Logger.log('handleUnfollowEvent called: %s', JSON.stringify(event));
	const uid = event.source && event.source.userId;
	Logger.log('Unfollow UID: %s', uid);
	if (!uid) return;
	const customer = searchCustomerByUid(uid);
	Logger.log(
		'Unfollow searchCustomerByUid result: %s',
		JSON.stringify(customer)
	);
	if (customer) {
		Logger.log('Updating customer for unfollow');
		const res = updateCustomer(customer.id, {
			uid: uid,
			lineBlocked: true,
		});
		Logger.log('updateCustomer response: %s', JSON.stringify(res));
	}
	return;
}
