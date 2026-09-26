import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "@/db/connection";
import { agencies, branches, customers, vehicles } from "@/db/schema";

migrate(db,{migrationsFolder:"drizzle"});
const now=new Date().toISOString();
db.insert(agencies).values({id:"agy-viberent",name:"VibeRent Mobility",currency:"PKR",timezone:"Asia/Karachi",createdAt:now,updatedAt:now}).onConflictDoNothing().run();
db.insert(branches).values([{id:"br-lahore",agencyId:"agy-viberent",name:"Lahore Gulberg",city:"Lahore",address:"Main Boulevard, Gulberg III",createdAt:now,updatedAt:now},{id:"br-islamabad",agencyId:"agy-viberent",name:"Islamabad Blue Area",city:"Islamabad",address:"Jinnah Avenue, Blue Area",createdAt:now,updatedAt:now}]).onConflictDoNothing().run();
db.insert(customers).values([{id:"cus-hamza",agencyId:"agy-viberent",name:"Hamza Siddiqui",phoneNormalized:"923215902741",cnicNormalized:"6110112345678",email:"hamza@example.pk",licenseNumber:"ICT-88420",licenseExpiresAt:"2028-03-14",createdAt:now,updatedAt:now},{id:"cus-areeba",agencyId:"agy-viberent",name:"Areeba Khan",phoneNormalized:"923008421190",cnicNormalized:"3520212345674",email:"areeba@example.pk",licenseNumber:"LHR-77102",licenseExpiresAt:"2028-07-09",createdAt:now,updatedAt:now}]).onConflictDoNothing().run();
db.insert(vehicles).values([{id:"veh-corolla",agencyId:"agy-viberent",branchId:"br-islamabad",plate:"ICT-704",make:"Toyota",model:"Corolla",year:2022,status:"available",ownership:"owned",dailyRate:9500,createdAt:now,updatedAt:now},{id:"veh-city",agencyId:"agy-viberent",branchId:"br-lahore",plate:"LEB-218",make:"Honda",model:"City",year:2023,status:"available",ownership:"owned",dailyRate:11000,createdAt:now,updatedAt:now}]).onConflictDoNothing().run();
console.log(JSON.stringify({ok:true,database:sqlite.name,seedRun:randomUUID()},null,2));
sqlite.close();
