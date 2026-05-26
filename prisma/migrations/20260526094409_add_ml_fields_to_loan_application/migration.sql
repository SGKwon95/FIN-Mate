-- AlterTable
ALTER TABLE "loan_application" ADD COLUMN     "ml_credit_score" INTEGER,
ADD COLUMN     "ml_decision" VARCHAR(10),
ADD COLUMN     "ml_default_prob" DECIMAL(7,4),
ADD COLUMN     "ml_dti" DECIMAL(7,2),
ADD COLUMN     "ml_home_ownership" VARCHAR(20),
ADD COLUMN     "ml_inq_last_6mths" INTEGER,
ADD COLUMN     "ml_pub_rec" INTEGER,
ADD COLUMN     "ml_score" INTEGER,
ADD COLUMN     "ml_screened_at" TIMESTAMPTZ;
