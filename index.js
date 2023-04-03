const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const schedule = require("node-schedule");
const fs = require("fs");
const path = require("path");
const input = require("input");

const axios = require("axios");

require("dotenv").config();

const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

// Мои модули
const { Telegram } = require("./modules/Telegram");
const { Check } = require("./modules/Check.js");
const { Rkn } = require("./modules/Rkn.js");
const { Captcha } = require("./modules/Captcha.js");

async function init() {
	const configPath = path.resolve(__dirname, ".env");

	const isExist = fs.existsSync(configPath);
	
	if (!isExist) {
		console.log("Файл с настройками не найден, создаем файл .env");
		const envScript = await input.text("Введите ссылку на скрипт");
		const envKey = await input.text("Введите ключ капчи");
		const envToken = await input.text("Введите токен бота");
		const envChatID = await input.text("Введите ID чата");
		const envSchedule = await input.select("Использовать планировщик?", ["Да", "Нет"]);
		const envTimeBetween = await input.text("Введите часы запуска скрипта, пример: 10-23");
		const envTimeoutInMin = await input.text("Введите время ожидания в минутах, пример: 5");
		
		fs.writeFileSync(configPath, `SCRIPT="${envScript}"\nKEY="${envKey}"\nTOKEN="${envToken}"\nCHAT_ID="${envChatID}"\nSCHEDULE="${envSchedule}"\nTIME_BETWEEN="${envTimeBetween}"\nTIMEOUT_IN_MIN="${envTimeoutInMin}"`);

		return console.log("Файл .env создан, запустите скрипт еще раз с помощью команды npm run start или node index.js");
	}
	
	// Константы
	const token = process.env.TOKEN;
	const chatID = process.env.CHAT_ID;
	const scriptURL = process.env.SCRIPT;
	const key = process.env.KEY;
	
	const useSchedule = process.env.SCHEDULE; // использовать планироващик = true не использовать = false
	
	let timeBetween = null;
	let timeoutInMin = null;
	let isWork = null;
	
	if (useSchedule != "Нет") {
		timeBetween = process.env.TIME_BETWEEN;
		timeoutInMin = process.env.TIMEOUT_IN_MIN;
		if (!timeBetween || !timeoutInMin)
			return console.log("Не указано время запуска скрипта и время ожидания");
	}
	
	const telegram = new Telegram(token, chatID);
	
	async function main(job = null) {
		if (isWork) {
			return;
		} else {
			isWork = true;
		}
	
		console.log("Скрипт начал работу...");
	
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
	
		let message = `Начало проверки сайтов\n<b>Общее кол-во сайтов:</b> ${sitesCount}\n`;
	
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
			url = url.replace(/(https|http|:\/\/|\/$)/gm, "");
	
			const checker = new Check();
	
			const checkURLResult = await checker.checkURL(url);
	
			const checkRobotsResult = await checker.checkRobots(
				url,
				checkURLResult.httpError,
			);
	
			const sitemapURL = checkRobotsResult?.sitemapURL;
	
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
	
		const blocked = [];
		const errorOpen = [];
		const redirected = [];
		const redirectedDomains = [];
		const sitemap = [];
		const host = [];
		const sitemapError = [];
		const notFound = [];
		const httpError = [];
	
		const robots = [];
	
		sitesResult.find(findSite);
	
		function findSite(elem) {
			elem.code = elem.code?.toString();
	
			if (elem.isBlocked) {
				blocked.push(elem.url);
			}
	
			if (elem.notOpen) {
				errorOpen.push(elem.url);
			}
	
			if (elem.notFound || elem.title?.includes("404")) {
				notFound.push(elem.url);
			}
	
			if (elem.httpError) {
				httpError.push(elem.url);
			}
	
			if (elem.isRedirect) {
				redirected.push(`${elem.fullURL} -> ${elem.finalURL}`);
				redirectedDomains.push(elem.url);
			}
	
			if (
				!elem.sitemap &&
				!redirectedDomains.includes(elem.url) &&
				!errorOpen.includes(elem.url) &&
				!notFound.includes(elem.url)
			) {
				sitemap.push(elem.url + "/robots.txt");
			}
	
			if (
				!elem.host &&
				!redirectedDomains.includes(elem.url) &&
				!errorOpen.includes(elem.url) &&
				!notFound.includes(elem.url)
			) {
				host.push(elem.url + "/robots.txt");
			}
	
			if (
				!elem.isSitemapExist &&
				!redirectedDomains.includes(elem.url) &&
				!errorOpen.includes(elem.url) &&
				!notFound.includes(elem.url)
			) {
				sitemapError.push(elem.url);
			}
		}
	
		if (host.length) {
			host.forEach((item) => {
				if (!robots.includes(item)) {
					robots.push(item);
				}
			});
		}
	
		if (sitemap.length) {
			sitemap.forEach((item) => {
				if (!robots.includes(item)) {
					robots.push(item);
				}
			});
		}
	
		message += `Заблокированные: ${blocked.length}\nЗаблокированные РКН: 0\nНе открываются: ${errorOpen.length}\nОшибка 404: ${notFound.length}\nОшибка HTTP: ${httpError.length}\nРедиректят: ${redirected.length}\nRobots: ${robots.length}\nSitemap: ${sitemapError.length}\n`;
	
		if (blocked.length) {
			message += `\n<b>Заблокированные домены:</b>\n${blocked.join("\n")}\n`;
		}
	
		if (errorOpen.length) {
			message += `\n<b>Не открываются:</b>\n${errorOpen.join("\n")}\n`;
		}
	
		if (notFound.length) {
			message += `\n<b>Страницы 404:</b>\n${notFound.join("\n")}\n`;
		}
	
		if (httpError.length) {
			message += `\n<b>Ошибка HTTP:</b>\n${httpError.join("\n")}\n`;
		}
	
		if (redirected.length) {
			message += `\n<b>Редиректят:</b>\n${redirected.join("\n")}\n`;
		}
	
		if (sitemap.length) {
			message += `\n<b>Ошибка robots.txt, Sitemap:</b>\n${sitemap.join("\n")}\n`;
		}
	
		if (host.length) {
			message += `\n<b>Ошибка robots.txt, Host:</b>\n${host.join("\n")}\n`;
		}
	
		if (sitemap.length) {
			message += `\n<b>Sitemap не найден (или ошибка):</b>\n${sitemapError.join(
				"\n",
			)}\n`;
		}
	
		message = message.replace("Начало проверки сайтов", "📌Проверка завершена");
	
		if (errorOpen.length) {
			await checkerWrapper(errorOpen, message);
	
			if (useSchedule == "Да") {
				// await sleep(Math.floor(minInMs / 2));
				job.cancel(true);
				console.log("Следующий запуск: ", new Date(job.nextInvocation()).toLocaleString());
			}
	
			isWork = false;
		} else {
			return await telegram.sendMessage(message);
		}
	}
	
	async function checkerWrapper(domains, message) {
		const captcha = new Captcha(key, "ImageToTextTask");
	
		//rkn logic
		const browser = await puppeteer.launch({
			headless: true,
			executablePath: executablePath(),
			ignoreDefaultArgs: ["--enable-automation"],
		});
	
		const rknSite = "https://eais.rkn.gov.ru/";
	
		const page = await browser.newPage();
	
		page.setDefaultNavigationTimeout(60000);
	
		const rkn = new Rkn(page, browser, captcha, telegram);
	
		const isLoad = await rkn
			.loadPage(rknSite)
			.then(() => true)
			.catch(() => false);
	
		if (!isLoad) {
			console.log("Не удалось загрузить сайт RKN");
			message += "\n<b>Не удалось загрузить сайт РКН</b>";
			await telegram.sendMessage(message);
			await browser.close();
			return;
		}
	
		let domainCounter = 0;
	
		let rknBlocked = [];
	
		const domainsList = domains;
	
		while (domainCounter < domainsList.length) {
			const domain = domainsList[domainCounter];
			let tryCounter = 0;
			let checkResult = null;
	
			while (
				!checkResult ||
				(checkResult.includes("Неверно указан защитный код") && tryCounter < 6)
			) {
				tryCounter++;
				console.log(`Для домена: ${domain} Попытка: ${tryCounter}`);
				checkResult = await check(domain);
			}
	
			if (tryCounter < 5) {
				const handledResult = await rkn.handleResult(checkResult, domain);
				if (handledResult) {
					rknBlocked.push(handledResult);
				}
			} else {
				console.log("Превышено количество попыток для домена");
			}
			domainCounter++;
		}
	
		if (rknBlocked.length) {
			message = message.replace(
				"Заблокированные РКН: 0",
				`Заблокированные РКН: ${rknBlocked.length}`,
			);
	
			message += "\n<b>Блок РКН:</b>";
			rknBlocked.forEach((item) => {
				message += `\n${item.domain}: ${item.text}`;
			});
	
			await telegram.sendMessage(message);
		} else {
			await telegram.sendMessage(message);
		}
	
		await browser.close();
	
		async function check(domain) {
			const captchaImage = await page.waitForSelector("#captcha_image");
	
			const screenshotBuffer = await captchaImage
				.screenshot({
					encoding: "base64",
				})
				.catch((err) => {
					console.log(err);
					return false;
				});
	
			if (!screenshotBuffer) return false;
	
			const solution = await rkn.resolveCaptcha(screenshotBuffer);
	
			const domainResult = await rkn.checkDomain(domain, solution);
	
			return domainResult;
		}
	}
	
	if (useSchedule === "Да") {
		const job = schedule.scheduleJob(
			`*/${timeoutInMin} ${timeBetween} * * *`,
			function () {
				main(job);
			},
		);
	
		console.log(
			`Следующий запуск в ${new Date(job.nextInvocation()).toLocaleString()}`,
		);
	} else {
		main();
	}	
}

init();