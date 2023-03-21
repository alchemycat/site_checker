//мои модули
const axios = require("axios");

require('dotenv').config();

// Мои модули
// const { GoogleSheets } = require("./modules/googleShets.js");
const { Telegram } = require("./modules/Telegram");
const { Check } = require("./modules/Check.js");

// Константы
const token = process.env.TOKEN;
const chatID = process.env.CHAT_ID;
const scriptURL = process.env.SCRIPT;

async function main() {
    const telegram = new Telegram(token, chatID);
    let finalMessage = '';

    let dublicatesMessage = '';
    let totalDublicates = 0;

    let response = await axios.get(scriptURL).then(res => {
        return res.data;
    }).catch(() => {
        return false;
    });

    if (!response) return;

    let list = response.split("\n"); 
    /\n/.test(response) ? list = response.split("\n") : list = response.split("\r");

    if (!list.length) return;

    list = list.filter(item => item.length);

    const sitesCount = list.length;

    let result = {};

    list.forEach(function(item) {
        if(!result[item]) {
            result[item] = 0;
        }
        result[item]++;
    });

    for(let key in result) {
        if(result[key] >= 2) {
            if (result[key] == 1) {
                result[key] = 0;
            }

            dublicatesMessage += `Домен ${key} количество повторений: ${--result[key]}\n`;
            totalDublicates += result[key];
        
        }
    }
    
    let withoutDublicates = [];

    list.forEach(domain => {
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
    
        const resultObject = {
            url,
            fullURL,
            ...checkURLResult,
            ...checkRobotsResult,
        }
        
        sitesResult.push(resultObject);
    }

    const blocked = [];
    const errorOpen = [];
    const redirected = [];
    const sitemap = [];
    const host = [];

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
            sitemap.push(elem.url);
        }
        
        if (!elem.host) {
            host.push(elem.url);
        }
    }

    if (blocked.length) {
        message += `Заблокированные домены:\n${blocked.join('\n')}`;
    }

    if (errorOpen.length) {
        message += `\nДомены которые не открываются:\n${errorOpen.join('\n')}`;
    }

    if (redirected.length) {
        message += `\nСайты которые редиректят на другие домены:\n${redirected.join('\n')}`;
    }

    
    if (sitemap.length) {
        message += `\nОшибка в файле robots.txt строка с Sitemap:\n${sitemap.join('\n')}`;
    }
    
    if (host.length) {
        message += `\nОшибка в файле robots.txt строка с Host:\n${host.join('\n')}`;
    }
    
    message = message.replace("Начало проверки сайтов", "Проверка завершена");

    telegram.sendMessage(message);
}

main();