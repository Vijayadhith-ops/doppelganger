import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const eventState=sqliteTable("event_state",{id:integer("id").primaryKey(),payload:text("payload").notNull(),revision:integer("revision").notNull().default(1),updatedAt:text("updated_at").notNull()});
export const participantSessions=sqliteTable("participant_sessions",{token:text("token").primaryKey(),participantCode:text("participant_code").notNull(),createdAt:text("created_at").notNull(),lastSeenAt:text("last_seen_at").notNull()});
export const adminSessions=sqliteTable("admin_sessions",{token:text("token").primaryKey(),createdAt:text("created_at").notNull(),expiresAt:text("expires_at").notNull()});
export const submissionKeys=sqliteTable("submission_keys",{clientId:text("client_id").primaryKey(),participantCode:text("participant_code").notNull(),createdAt:text("created_at").notNull()});
