DROP INDEX `drivers_agency_cnic_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `drivers_agency_cnic_uq` ON `drivers` (`agency_id`,`cnic_normalized`) WHERE "drivers"."cnic_normalized" <> '';