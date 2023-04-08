import { executablePath } from "puppeteer";
import puppeteer from "puppeteer-extra";
import schedule from "node-schedule";
import fs from "fs";
import path from "path";
import input from "input";
import axios from "axios";
import logUpdate from "log-update";
import chalk from "chalk";
import ora from "ora";
import cluster from "cluster";

import * as dotenv from "dotenv";

dotenv.config();

import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

// Мои модули
import Telegram from "./modules/Telegram.js";
import Check from "./modules/Check.js";
import Rkn from "./modules/Rkn.js";
import Captcha from "./modules/Captcha.js";

const __dirname = path.resolve();
const threadsLength = 2;

async function config() {
	const configPath = path.resolve(__dirname, "config.json");

	const isExist = fs.existsSync(configPath);

	if (!isExist) {
		console.log("Файл с настройками не найден, создаем файл config.json");
		const envScript = await input.text("Введите ссылку на скрипт");
		const envKey = await input.text("Введите ключ капчи");
		const envToken = await input.text("Введите токен бота");
		const envChatID = await input.text("Введите ID чата");
		const envSchedule = await input.select("Использовать планировщик?", [
			"Да",
			"Нет",
		]);

		let envTimeBetween = null;
		let envTimeoutInMin = null;

		if (envSchedule == "Да") {
			envTimeBetween = await input.text(
				"Введите часы запуска скрипта, пример: 10-23",
			);
			envTimeoutInMin = await input.text(
				"Введите время ожидания в минутах, пример: 5",
			);
		}

		const config = {};
		config.script = envScript;
		config.key = envKey;
		config.token = envToken;
		config.chatID = envChatID;
		config.schedule = envSchedule;
		config.timeBetween = envTimeBetween;
		config.timeoutInMin = envTimeoutInMin;

		fs.writeFileSync(configPath, JSON.stringify(config));

		console.log("Файл config.json создан.");
		return await config();
	} else {
		const action = await input.select("Выберите действие:", [
			"Запустить скрипт",
			"Изменить настройки скрипта",
			"Выход",
		]);

		if (action == "Запустить скрипт") {
			let configData = fs.readFileSync(configPath, "utf8");
			configData = JSON.parse(configData);
			init(configData);
		} else if (action == "Изменить настройки скрипта") {
			async function changeConfig() {
				const option = await input.select("Выбирите настройку для изменения:", [
					"Ссылка на скрипт",
					"Ключ капчи",
					"Токен Телеграм",
					"Чат ID Телеграм",
					"Планировщик",
					"Время запуска скрипта",
					"Время таймаута",
					"Вернуться в главное меню",
				]);

				let config;

				async function setConfig(
					key,
					methodName,
					question,
					configPath,
					answerArray = null,
				) {
					config = fs.readFileSync(configPath, { encoding: "utf8" });
					config = JSON.parse(config);
					if (answerArray) {
						config[key] = await input[methodName](question, answerArray);
					} else {
						config[key] = await input[methodName](question);
					}
					fs.writeFileSync(configPath, JSON.stringify(config));
					console.log("Настройка сохранена");
				}

				if (option == "Ссылка на скрипт") {
					await setConfig(
						"script",
						"text",
						"Введите ссылку на скрипт",
						configPath,
					);
				} else if (option == "Ключ капчи") {
					await setConfig("key", "text", "Введите ключ капчи", configPath);
				} else if (option == "Токен Телеграм") {
					await setConfig(
						"token",
						"text",
						"Введите Токен Телеграм",
						configPath,
					);
				} else if (option == "Чат ID Телеграм") {
					await setConfig(
						"chatID",
						"text",
						"Введите Чат ID Телеграм",
						configPath,
					);
				} else if (option == "Планировщик") {
					await setConfig(
						"schedule",
						"select",
						"Использовать планировщик?",
						configPath,
						["Да", "Нет"],
					);
				} else if (option == "Время запуска скрипта") {
					await setConfig(
						"timeBetween",
						"text",
						"Введите часы запуска скрипта, пример: 10-23",
						configPath,
					);
				} else if (option == "Время таймаута") {
					await setConfig(
						"timeoutInMin",
						"text",
						"Введите время ожидания в минутах, пример: 5",
						configPath,
					);
				} else if (option == "Вернуться в главное меню") {
					return await config();
				}

				return await changeConfig();
			}

			await changeConfig();
		} else if (action == "Выход") {
			return;
		}
	}
}

if(cluster.isMaster) {
	// config();
} else {
	// main();
	process.on('message', function(message) {
		if (message === 'run-task') {
		  console.log('Выполняю задачу');
		}
	  });
}


async function init(configData) {
	// Константы
	const token = configData.token;
	const chatID = configData.chatID;
	const scriptURL = configData.script;
	const key = configData.key;

	const useSchedule = configData.schedule; // использовать планироващик = true не использовать = false

	let timeBetween = null;
	let timeoutInMin = null;
	let isWork = null;

	if (useSchedule == "Да") {
		timeBetween = configData.timeBetween;
		timeoutInMin = configData.timeoutInMin;
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

		const spinner = ora("Подготовка к проверке сайтов").start();

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

		spinner.succeed();

		for (let i = 0; i < list.length; i++) {
			const fullURL = list[i];
			let url = list[i];
			url = url.replace(/(https|http|:\/\/|\/$)/gm, "");

			logUpdate(
				`Сайт: ${chalk.bold.magenta(url)} проверено: ${chalk.bold.green(
					i + 1,
				)} ${chalk.bold.green("из")} ${chalk.bold.green(list.length)}`,
			);

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

		logUpdate.done();

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
				if (elem.finalURL === "http://blackhole.beeline.ru/") {
					blocked.push(elem.url);
					if (httpError.includes(elem.url)) {
						httpError.splice(httpError.indexOf(elem.url), 1);
					}
				} else {
					redirected.push(`${elem.fullURL} -> ${elem.finalURL}`);
					redirectedDomains.push(elem.url);
				}
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
			message += `\n<b>Ошибка robots.txt, Sitemap:</b>\n${sitemap.join(
				"\n",
			)}\n`;
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
				job.cancel(true);
				console.log(
					"Следующий запуск ",
					new Date(job.nextInvocation()).toLocaleString("ru-RU", {
						hour12: false,
					}),
				);
			}

			isWork = false;
		} else {
			const taskSendMessage = ora("Отправка результатов в Телеграм").start();
			await telegram.sendMessage(message);
			return taskSendMessage.succeed();
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

		let oraMessage = ora("Загрузка сайта РКН").start();

		const rknSite = "https://eais.rkn.gov.ru/";

		const page = await browser.newPage();

		page.setDefaultNavigationTimeout(60000);

		const rkn = new Rkn(page, browser, captcha, telegram);

		const isLoad = await rkn
			.loadPage(rknSite)
			.then(() => true)
			.catch(() => false);

		if (!isLoad) {
			oraMessage.fail();
			console.log("Не удалось загрузить сайт RKN");
			message += "\n<b>Не удалось загрузить сайт РКН</b>";
			await telegram.sendMessage(message);
			await browser.close();
			return;
		}

		oraMessage.succeed();

		let domainCounter = 0;

		let rknBlocked = [];

		const domainsList = domains;

		while (domainCounter < domainsList.length) {
			const domain = domainsList[domainCounter];
			let tryCounter = 0;
			let checkResult = null;
			logUpdate(
				`Проверка РКН: ${chalk.bold.magenta(
					domain,
				)} проверено: ${chalk.bold.green(domainCounter + 1)} ${chalk.bold.green(
					"из",
				)} ${chalk.bold.green(domainsList.length)}`,
			);
			while (
				!checkResult ||
				(checkResult.includes("Неверно указан защитный код") && tryCounter < 6)
			) {
				tryCounter++;
				checkResult = await check(domain);
			}

			if (tryCounter < 5) {
				const handledResult = await rkn.handleResult(checkResult, domain);
				if (handledResult) {
					rknBlocked.push(handledResult);
				}
			} else {
			}
			domainCounter++;
		}

		logUpdate.done();

		const oraResult = ora("Отправка результатов в Телеграм").start();

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

		oraResult.succeed();

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

		const nextInvoc = new Date(job.nextInvocation()).toLocaleString("ru-RU", {
			hour12: false,
		});

		await telegram.sendMessage(`Следующий запуск ${nextInvoc}`);
		console.log(`Следующий запуск в ${nextInvoc}`);
	} else {
		main();
	}
}
