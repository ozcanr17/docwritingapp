ALTER TABLE "test_step_details" ADD COLUMN "stepNumber" INTEGER;

ALTER TABLE "test_step_details" ADD CONSTRAINT "test_step_details_stepNumber_check" CHECK ("stepNumber" IS NULL OR "stepNumber" > 0);
