import axios from "axios";

class Captcha {
	data = null;
	key = null;
	task_key = null;

	constructor(key, captchaType) {
		this.key = key;
		this.task_key = `${key}__universal`
		this.captchaType = captchaType;
	}

	async createTask(base64) {
		const data = {
			clientKey: this.task_key,
			task: {
				type: this.captchaType,
				body: base64,
			},
		};

		const response = await axios.post(
			"https://api.capmonster.cloud/createTask",
			data,
		);

		return response;
	}

	async getTaskResutlt(taskId) {
		const data = {
			clientKey: this.key,
			taskId: taskId,
		};
		return await axios.post(
			"https://api.capmonster.cloud/getTaskResult/", data
		).catch(err => {
            return err;
        })
	}

	async getBalance() {
		const data = {
			clientKey: this.key
		}
		return axios.post("https://api.capmonster.cloud/getBalance", data).catch(err => {
			return err;
		})
	}
}

export default Captcha;