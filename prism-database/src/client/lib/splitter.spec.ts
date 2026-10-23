import { describe, expect, it } from 'vitest';
import { SqlSplitter, splitSql } from './splitter';

describe('splitSql', () => {
    it('splits on semicolons outside strings, names and comments', () => {
        expect(splitSql("INSERT INTO t VALUES ('a;b', \"c;d\", `e;f`); SELECT 1; -- note; here\nSELECT 2 # x;y\n; /* a; b */ SELECT 3")).toEqual([
            "INSERT INTO t VALUES ('a;b', \"c;d\", `e;f`)",
            'SELECT 1',
            '-- note; here\nSELECT 2 # x;y',
            '/* a; b */ SELECT 3',
        ]);
    });

    it('handles escaped and doubled quotes', () => {
        expect(splitSql("SELECT 'it''s; fine'; SELECT 'back\\';slash';")).toEqual(["SELECT 'it''s; fine'", "SELECT 'back\\';slash'"]);
    });

    it('keeps executable comments and drops empty ones', () => {
        expect(splitSql('/*!40101 SET NAMES utf8mb4 */;\n/* just a note */;\n-- only a comment\n;')).toEqual(['/*!40101 SET NAMES utf8mb4 */']);
    });

    it('follows DELIMITER changes for triggers and routines', () => {
        const sql = 'DELIMITER ;;\nCREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END ;;\nDELIMITER ;\nSELECT 1;';
        expect(splitSql(sql)).toEqual(['CREATE TRIGGER t BEFORE INSERT ON x FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END', 'SELECT 1']);
    });

    it('skips statements that switch or replace the database', () => {
        expect(splitSql('CREATE DATABASE x; USE x; DROP DATABASE IF EXISTS y; SELECT 1;')).toEqual(['SELECT 1']);
    });

    it('works across chunks and reports where each statement ends', () => {
        const sql = "INSERT INTO t VALUES ('a;b');\nSELECT 2;";
        const splitter = new SqlSplitter();
        const statements = [...splitter.feed(sql.slice(0, 20)), ...splitter.feed(sql.slice(20, 33)), ...splitter.feed(sql.slice(33), true)];
        expect(statements.map((statement) => statement.sql)).toEqual(["INSERT INTO t VALUES ('a;b')", 'SELECT 2']);
        expect(statements[0].end).toBe(sql.indexOf(';\n') + 1);
        expect(statements[1].end).toBe(sql.length);

        // Resuming from the first statement's end gives the rest.
        const resumed = new SqlSplitter(statements[0].end).feed(sql.slice(statements[0].end), true);
        expect(resumed).toEqual([{ sql: 'SELECT 2', end: sql.length }]);
    });
});
