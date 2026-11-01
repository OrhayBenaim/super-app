-- Full-text search over products. Standalone FTS5 table kept in sync by triggers (drizzle-kit cannot model it).
CREATE VIRTUAL TABLE `products_fts` USING fts5(code UNINDEXED, name, manufacturer, tokenize = 'unicode61');
--> statement-breakpoint
INSERT INTO `products_fts` (code, name, manufacturer) SELECT code, name, manufacturer FROM `products`;
--> statement-breakpoint
CREATE TRIGGER `products_fts_ai` AFTER INSERT ON `products` BEGIN
  INSERT INTO products_fts (code, name, manufacturer) VALUES (new.code, new.name, new.manufacturer);
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_ad` AFTER DELETE ON `products` BEGIN
  DELETE FROM products_fts WHERE code = old.code;
END;
--> statement-breakpoint
CREATE TRIGGER `products_fts_au` AFTER UPDATE OF name, manufacturer ON `products`
WHEN old.name IS NOT new.name OR old.manufacturer IS NOT new.manufacturer BEGIN
  DELETE FROM products_fts WHERE code = old.code;
  INSERT INTO products_fts (code, name, manufacturer) VALUES (new.code, new.name, new.manufacturer);
END;
