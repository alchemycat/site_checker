const axios = require("axios");
const punycode = require("punycode");

class Check {
	checkCyrillic(url) {
		const cyrillicPattern = /[а-яА-ЯЁё]/;
		return cyrillicPattern.test(url);
	}

	async checkURL(url) {
		const result = {
			finalURL: null,
			code: null,
			isRedirect: null,
			isBlocked: null,
			title: null,
			httpError: null,
			notFound: null,
			notOpen: null,
		};

		let isCyr = false;

		isCyr = this.checkCyrillic(url);

		await axios
			.get(`http://${url}`)
			.then((response) => {
				const html = response.data;

				let finalURL = response.request.res.responseUrl;

				if (isCyr) {
					const punyUrl = punycode.toASCII(url);

					const replaced = finalURL.replace(punyUrl, "{pholder}");

					if (replaced.includes("{pholder}")) {
						const decodedUrl = punycode.toUnicode(punyUrl);

						finalURL = replaced.replace("{pholder}", decodedUrl);
					}
				}

				result.code = response.request.res.statusCode;

				finalURL.includes("https")
					? (result.httpError = false)
					: (result.httpError = true);

				result.isBlocked = /Не\sудается\sполучить\sдоступ\sк\sсайту/gm.test(
					html,
				);

				if (/(?<=<title>).*(?=<\/title>)/gm.test(html)) {
					result.title = html.match(/(?<=<title>).*(?=<\/title>)/gm)[0];
				}

				!finalURL.includes(url)
					? (result.isRedirect = true)
					: (result.isRedirect = false);

				result.finalURL = finalURL;
			})
			.catch((error) => {
				// console.log(error);
				if (error.response?.status === 404) {
					result.notFound = true;
				} else {
					result.notOpen = true;
				}
			});

		return result;
	}

	async checkSitemap(url) {
		const response = await axios.get(url).catch(() => false);

		if (!response) {
			return false;
		}

		return true;
	}

	async checkRobots(url, httpError) {
		let protocol = httpError ? "http" : "https";
		return await axios
			.get(`${protocol}://${url}/robots.txt`)
			.then((response) => {
				const result = {
					sitemap: null,
					host: null,
					sitemapURL: null,
				};

				const punyUrl = punycode.toASCII(url);

				let host = null,
					sitemap = null;

				/(?<=Host\:\s).*(?=\n)/gm.test(response.data)
					? (host = response.data.match(/(?<=Host\:\s).*(?=\n)/gm)[0])
					: (host = false);
				/(?<=Sitemap\:\s).*(?=(\n|))/gm.test(response.data)
					? (sitemap = response.data.match(/(?<=Sitemap\:\s).*(?=(\n|))/gm)[0])
					: (sitemap = false);

				if (
					(host && host.includes(`https://${url}`)) ||
					host === `https://${punyUrl}`
				) {
					result.host = true;
				}

				if (
					(sitemap && sitemap.includes(`https://${url}`)) ||
					sitemap.includes(`https://${punyUrl}`)
				) {
					result.sitemap = true;
					result.sitemapURL = sitemap;
				}

				return result;
			})
			.catch(() => false);
	}
}

exports.Check = Check;
