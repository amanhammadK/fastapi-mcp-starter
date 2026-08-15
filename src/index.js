import { FastapiMcpServer } from "./mcpServer.js";

const server = new FastapiMcpServer();
server.run().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
