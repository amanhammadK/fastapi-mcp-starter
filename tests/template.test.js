import { FastapiMcpServer } from "../src/mcpServer.js";

describe("FastapiMcpServer", () => {
    let server;

    beforeEach(() => {
        server = new FastapiMcpServer();
    });

    test("should initialize server", () => {
        expect(server).toBeDefined();
        expect(server.server).toBeDefined();
    });
});
