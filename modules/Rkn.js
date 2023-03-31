class Rkn {
	constructor(page, browser, captcha) {
		this.page = page;
		this.browser = browser;
		this.captcha = captcha;
	}

	async handleResult(result, domain) {
		if (result.includes("Искомый ресурс внесен в реестр по основаниям")) {
			console.log("домен найден в реестре");
			await this.page.waitForSelector(".line");
			const text = await this.page.evaluate(() => {
				const lines = document.querySelectorAll(".line");
				let result;
				for (let i = 0; i < lines.length; i++) {
					if (i > 0) {
						let line = lines[i].textContent;
						line = line.split("\n");
						line = line.map((item) => item.trim());
						line = line.filter((item) => {
							if (item.length) {
								return item;
							}
						});
						result = line[2];
						// line = line.join(" ").trim();
						// result.push(line);
					}
				}
				// /фнс\sограничивается/gmi
				// return result.join("\n");
				return result;
			});

			return { domain, text };
		} else {
			console.log("домен не найден в реестре");
			return false;
		}
	}

	async loadPage(site) {
		await this.page.goto(site);
		await this.page.waitForSelector("#person");
	}

	async resetInputs() {
		await this.page.waitForSelector(".inputMsg");
		await this.page.evaluate(() => {
			document.querySelector(".inputMsg").value = "";
			document.querySelector("#captcha").value = "";
		});
		await this.page.waitForTimeout(500);
	}

	async resolveCaptcha(image) {
		return new Promise(async (resolve) => {
			try {
				let res = await this.captcha.createTask(image);

				let task_id;

				task_id = res.data.taskId;

				let counter = 0;
				let solution = null;

				const id = setInterval(async () => {
					const res = await this.captcha.getTaskResutlt(task_id);
					counter++;
					if (res.data) {
						if (res.data.status === "ready") {
							clearInterval(id);
							solution = res.data.solution.text;
							resolve(solution);
						} else {
							console.log("Капча еще не готова");
						}
					}

					if (counter >= 6) {
						clearInterval(id);
						resolve(false);
					}
				}, 5000);
			} catch (err) {
				console.log(err);
				resolve(false);
			}
		});
	}

	async checkDomain(domain, solution) {
		try {
			await this.page.evaluate(() => {
				document.querySelector(".inputMsg").value = "";
			});

			await this.page.waitForTimeout(500);

			await this.page.type(".inputMsg", domain);

			await this.page.waitForTimeout(500);

			await this.page.type("#captcha", solution);

			await this.page.waitForTimeout(500);

			await this.page.click("#send_but2");

			await this.page.waitForTimeout(2000);

			await this.page.waitForSelector(".messageFlash");

			const resultMessage = await this.page.evaluate(() => {
				try {
					return document.querySelector(".messageFlash").textContent;
				} catch {
					return false;
				}
			});

			return resultMessage;
		} catch {
			return false;
		}
	}
}

exports.Rkn = Rkn;
