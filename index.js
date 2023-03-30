const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const fs = require("fs");

const axios = require("axios");

require("dotenv").config();

const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

// Мои модули
// const { GoogleSheets } = require("./modules/googleShets.js");
const { Telegram } = require("./modules/Telegram");
const { Check } = require("./modules/Check.js");
const { Rkn } = require("./modules/Rkn.js");
const { Captcha } = require("./modules/Captcha.js");

// Константы
const token = process.env.MAIN_TOKEN;
const chatID = process.env.MAIN_CHAT_ID;
const scriptURL = process.env.SCRIPT;
const key = process.env.KEY;

async function main() {
	const telegram = new Telegram(token, chatID);
	const captcha = new Captcha(key);

	const balance = await captcha.getBalance();

	if (balance < 0.1) {
		return await telegram.sendMessage("Необходимо пополнить баланс капчи");
	}

	let dublicatesMessage = "";
	let totalDublicates = 0;

	let response = await axios
		.get(scriptURL)
		.then((res) => {
			return res.data;
		})
		.catch(() => {
			return false;
		});

	if (!response) return;

	let list = response.split("\n");
	/\n/.test(response)
		? (list = response.split("\n"))
		: (list = response.split("\r"));

	if (!list.length) return;

	list = list.filter((item) => item.length);

	const sitesCount = list.length;

	let result = {};

	list.forEach(function (item) {
		if (!result[item]) {
			result[item] = 0;
		}
		result[item]++;
	});

	for (let key in result) {
		if (result[key] >= 2) {
			if (result[key] == 1) {
				result[key] = 0;
			}

			dublicatesMessage += `Домен ${key} количество повторений: ${--result[
				key
			]}\n`;
			totalDublicates += result[key];
		}
	}

	let withoutDublicates = [];

	list.forEach((domain) => {
		if (!withoutDublicates.includes(domain)) {
			withoutDublicates.push(domain);
		}
	});

	list = withoutDublicates;

	let message = `Начало проверки сайтов\nКоличество сайтов: ${sitesCount}\n`;

	if (totalDublicates) {
		message += `Одинаковых сайтов: ${totalDublicates}\n`;
		message += `${dublicatesMessage}`;
	}

	telegram.sendMessage(message);

	// проверка сайта на ответ sitemap,host, ошибка http, редирект, блокировку, статус код

	let sitesResult = [];

	for (let i = 0; i < list.length; i++) {
		const fullURL = list[i];
		url = list[i];
		url = url.replace(/(https|http|:\/\/|www\.|\/$)/gm, "");

		const checker = new Check();

		const checkURLResult = await checker.checkURL(url);

		const checkRobotsResult = await checker.checkRobots(url);

		const { sitemapURL } = checkRobotsResult;

		let isSitemapExist = false;

		if (sitemapURL) {
			isSitemapExist = await checker.checkSitemap(sitemapURL);
		}

		const resultObject = {
			url,
			fullURL,
			isSitemapExist,
			...checkURLResult,
			...checkRobotsResult,
		};

		sitesResult.push(resultObject);
	}

	console.log(sitesResult);

	const blocked = [];
	const errorOpen = [];
	const redirected = [];
	const sitemap = [];
	const host = [];
	const sitemapError = [];

	sitesResult.find(findSite);

	function findSite(elem) {
		elem.code = elem.code.toString();

		if (elem.isBlocked) {
			blocked.push(elem.url);
		}

		if (elem.code[0] == 4 || elem.code[0] == 5) {
			errorOpen.push(elem.url);
		}

		if (elem.isRedirect) {
			redirected.push(`${elem.fullURL} -> ${elem.finalURL}`);
		}

		if (!elem.sitemap) {
			sitemap.push(elem.url + "/robots.txt");
		}

		if (!elem.host) {
			host.push(elem.url + "/robots.txt");
		}

		if (!elem.isSitemapExist) {
			sitemapError.push(elem.url);
		}
	}

	if (blocked.length) {
		message += `Заблокированные домены:\n${blocked.join("\n")}`;
	}

	if (errorOpen.length) {
		message += `\nДомены которые не открываются:\n${errorOpen.join("\n")}`;
	}

	if (redirected.length) {
		message += `\nСайты которые редиректят на другие домены:\n${redirected.join(
			"\n",
		)}`;
	}

	if (sitemap.length) {
		message += `\nОшибка в файле robots.txt строка с Sitemap:\n${sitemap.join(
			"\n",
		)}`;
	}

	if (host.length) {
		message += `\nОшибка в файле robots.txt строка с Host:\n${host.join("\n")}`;
	}

	if (sitemap.length) {
		message += `\nФайл Sitemap не найден или не открывается для доменов:\n${sitemapError.join(
			"\n",
		)}`;
	}

	message = message.replace("Начало проверки сайтов", "Проверка завершена");

	telegram.sendMessage(message);
}

// main();

async function checkerWrapper(domains, message) {
	const captcha = new Captcha(key, "ImageToTextTask");

	const resultBot = new Telegram(
		process.env.MAIN_TOKEN,
		process.env.MAIN_CHAT_ID,
	);

	const logsBot = new Telegram(
		process.env.LOGS_TOKEN,
		process.env.LOGS_CHAT_ID,
	);

	//rkn logic
	const browser = await puppeteer.launch({
		headless: true,
		executablePath: executablePath(),
		ignoreDefaultArgs: ["--enable-automation"],
	});

	const rknSite = process.env.TARGET_SITE;

	const page = await browser.newPage();

	page.setDefaultNavigationTimeout(60000);

	const rkn = new Rkn(page, browser, captcha, resultBot, logsBot);

	await rkn.loadPage(rknSite);

	let domainCounter = 0;

	const domainsList = domains;

	while (domainCounter < domainsList.length) {
		const domain = domainsList[domainCounter];
		let tryCounter = 0;
		let checkResult = null;

		while (
			!checkResult ||
			(checkResult.includes("Неверно указан защитный код") && tryCounter < 5)
		) {
			tryCounter++;
			console.log(`Для домена: ${domain} Попытка: ${tryCounter}`);
			checkResult = await check(domain);
		}

		if (tryCounter < 5) {
			await rkn.handleResult(checkResult, domain);
		} else {
			console.log("Превышено количество попыток для домена");
		}
		domainCounter++;
		//Ошибка! Неверно указан защитный код
	}

	console.log("Проверка завершена");

	await browser.close();

	async function check(domain) {
		const captchaImage = await page.waitForSelector("#captcha_image");

		const screenshotBuffer = await captchaImage.screenshot({
			encoding: "base64",
		});

		const solution = await rkn.resolveCaptcha(screenshotBuffer);

		const domainResult = await rkn.checkDomain(domain, solution);

		return domainResult;
	}
}

checkerWrapper();