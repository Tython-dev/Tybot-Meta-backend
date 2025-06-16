const swaggerJSDoc = require("swagger-jsdoc");

const options = {
	definition: {
		openapi: "3.0.0",
		info: {
			title: "CHATBOTS API Documentation",
			version: "1.0.0",
			description: "API Documentation for the application ChatBots",
		},
		servers: [
			{
				url: "http://localhost:3009/api/v1/",
			},
			{
				url: "http://meta-api.tybot.ma/api/v1",
			},
		],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "JWT",
				},
			},
		},
		security: [
			{
				bearerAuth: [],
			},
		],
	},
	apis: ["./src/routes/*.js"], // Path to the API routes
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
