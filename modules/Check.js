const axios = require("axios");

class Check {

    getTitle(response) {
        return title;
    }

    checkIsBlocked(response) {
        return isBlocked;
    }

    getCode(response) {
        return code;
    }

    checkIsRedirect(response) {
        return isRedirect;
    }

    async checkURL(url) {
        const result = {
            finalURL: null,
            code: null,
            isRedirect: null,
            isBlocked: null,
            title: null,
            httpError: null
        }

        await axios.get(`http://${url}`).then(response => {
            const html = response.data;            
            const finalURL = response.request.res.responseUrl;
            result.code = response.request.res.statusCode;

            finalURL === `https://${url}/` ? result.httpError = false : result.httpError = true;
            
            result.isBlocked = /Не\sудается\sполучить\sдоступ\sк\sсайту/gm.test(html);

            if (/(?<=<title>).*(?=<\/title>)/gm.test(html)) {
                result.title =  html.match(/(?<=<title>).*(?=<\/title>)/gm)[0];
            }

            !finalURL.includes(url) ? result.isRedirect = true : result.isRedirect = false;

            result.finalURL = finalURL;
        }).catch(() => false);

        return result;
    }

    async checkRobots(url) {                        
        return await axios.get(`https://${url}/robots.txt`).then(response => {
            const result = {
                sitemap: null,
                host: null,
            };

            let host = null, sitemap = null;

            /(?<=Host\:\s).*(?=\n)/gm.test(response.data) ? host = response.data.match(/(?<=Host\:\s).*(?=\n)/gm)[0] : host = false;
            /(?<=Sitemap\:\s).*(?=(\n|))/gm.test(response.data) ? sitemap = response.data.match(/(?<=Sitemap\:\s).*(?=(\n|))/gm)[0] : sitemap = false;

            if (host && host === `https://${url}`) result.host = true;
            if (sitemap && sitemap.includes(`https://${url}`)) result.sitemap = true;
            
            return result;
        }).catch(() => false);

    }

}

exports.Check = Check;