const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const setupSwagger = (app, port) => {
  const swaggerOptions = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Excel to GCP Upload API",
        version: "1.0.0",
        description: "API to upload Excel files to Google Cloud Storage",
      },
      servers: [
        {
          url: `http://localhost:${port}`,
        },
      ],
    },
    apis: ["./routes/*.js"], // Path to the API docs (relative to server root)
  };

  const swaggerDocs = swaggerJsdoc(swaggerOptions);
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
  console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
};

module.exports = setupSwagger;
