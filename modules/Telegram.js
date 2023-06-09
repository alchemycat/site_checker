import axios from "axios";
import crypto from "crypto";
import chalk from "chalk";
import sleep from "./sleep.js";

class Telegram {
	constructor(token, chatID) {
		this.token = token;
		this.chatID = chatID;
	}

	async sendMessage(message) {
		if (message.length > 4096) {
			let chunks = [];
			let parts = Math.floor(message.length / 4096);

			for (let i = 0; i < parts; i++) {
				chunks.push(message.slice(i * 4096, (i + 1) * 4096));
			}

			for (let i = 0; i < chunks.length; i++) {
				const chunk = chunks[i];
				await axios.post(
					`https://api.telegram.org/bot${this.token}/sendMessage`,
					{
						chat_id: this.chatID,
						text: chunk,
						parse_mode: "HTML",
					},
				);
			}
		} else {
			await axios.post(
				`https://api.telegram.org/bot${this.token}/sendMessage`,
				{
					chat_id: this.chatID,
					text: message,
					parse_mode: "HTML",
				},
			);
		}
	}

	async getCode(thread_name, loginName) {
		return await new Promise(async (resolve) => {
			let counter = 0;
			let uuid = crypto.randomUUID();
			this.sendMessage(
				`При логине в аккаунт: ${loginName} требуется код подтверждения. \nВведите ответ в таком ввиде\n${uuid}:код `,
			);

			let code = false;
			let messages;

			while (!code && counter < 25) {
				counter++;
				console.log(`${chalk.bold(thread_name)} Ожидаю сообщение с кодом`);
				messages = await axios
					.get(`https://api.telegram.org/bot${this.token}/getUpdates`)
					.then((response) => response.data.result);

				messages.forEach(({ message }) => {
					if (message.text.includes(uuid)) {
						code = message.text;
					}
				});
				await sleep(5000);
			}
			if (code) {
				resolve(code.match(/(?<=\:).*/)[0]);
			} else {
				resolve(false);
			}
		});
	}
}

export default Telegram;
