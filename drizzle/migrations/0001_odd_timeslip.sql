ALTER TABLE `household_members` ADD `onboarding_completed_at` integer;--> statement-breakpoint
-- Onboarding used to be a household-level fact. Whoever owns a household that
-- already finished it has, by definition, already answered these questions —
-- marking them done keeps existing users out of a wizard they completed.
-- Partners are deliberately left null: they never declared their own income.
UPDATE `household_members`
SET `onboarding_completed_at` = (
  SELECT `onboarding_completed_at` FROM `households`
  WHERE `households`.`id` = `household_members`.`household_id`
)
WHERE `role` = 'owner'
  AND EXISTS (
    SELECT 1 FROM `households`
    WHERE `households`.`id` = `household_members`.`household_id`
      AND `households`.`onboarding_completed_at` IS NOT NULL
  );
