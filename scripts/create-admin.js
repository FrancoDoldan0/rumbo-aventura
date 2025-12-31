const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = "admin@rumboaventura.com";
  const password = "admin123";

  const hash = await bcrypt.hash(password, 10);

  await prisma.adminUser.create({
    data: {
      email,
      passwordHash: hash,
    },
  });

  console.log("✅ Admin creado:", email);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
