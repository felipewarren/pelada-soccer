// 30 clearly fake demo players (is_demo=1)
module.exports = async function seed(db, uniquePin) {
  const names = [
    ['Zé Bolinha', 'Bolinha', 'GK', 1], ['Jean Exemple', 'Jeannot', 'GK', 1], ['Paulo Teste', 'Paulão', 'GK', 1], ['Marc Fictif', 'Marco', 'GK', 1],
    ['Tico Demo', 'Tico', 'ST', 0], ['Luc Imaginaire', 'Lucky', 'ST', 0], ['Beto Fantasia', 'Betão', 'CAM', 0], ['Rafa Placeholder', 'Rafinha', 'LW', 0],
    ['Pierre Bidon', 'Pipo', 'RW', 0], ['Nando Fake', 'Nandinho', 'CM', 0], ['Guy Pseudo', 'Guyzinho', 'CDM', 0], ['Dudu Inventado', 'Dudu', 'CB', 0],
    ['Samuel Sample', 'Samba', 'CB', 0], ['Chico Mock', 'Chicão', 'RB', 0], ['Éric Essai', 'Ricky', 'LB', 0], ['Mané Mockado', 'Mané', 'ST', 0],
    ['Félix Factice', 'Fefe', 'CM', 0], ['Juca Ficção', 'Juca', 'CDM', 0], ['Yves Virtuel', 'Yvinho', 'CB', 0], ['Toni Teste', 'Toninho', 'RW', 0],
    ['Gabi Gabarito', 'Gabi', 'LW', 0], ['Hugo Hypothèse', 'Huguinho', 'CAM', 0], ['Lalo Lorem', 'Lalo', 'ST', 0], ['Max Ipsum', 'Maxi', 'CM', 0],
    ['Nico Nulo', 'Nico', 'RB', 0], ['Olivier Ombre', 'Oli', 'LB', 0], ['Pepe Protótipo', 'Pepe', 'CB', 0], ['René Rascunho', 'Renê', 'CDM', 0],
    ['Sergio Simulado', 'Serginho', 'CM', 0], ['Vava Vazio', 'Vavá', 'ST', 0]];
  let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const r = (lo, hi) => Math.round(lo + rnd() * (hi - lo));
  const ids = [];
  for (const [n, nick, pos, gk] of names) {
    const atk = pos === 'GK' ? r(35, 55) : ['ST', 'LW', 'RW', 'CAM'].includes(pos) ? r(62, 88) : r(45, 70);
    const def = pos === 'GK' ? r(65, 85) : ['CB', 'RB', 'LB', 'CDM'].includes(pos) ? r(62, 86) : r(40, 65);
    const row = await db.get('INSERT INTO players(name,nickname,position,can_gk,age,atk,def,str,skl,pin,is_demo) VALUES(?,?,?,?,?,?,?,?,?,?,1) RETURNING id',
      n, nick, pos, gk, r(30, 60), atk, def, r(50, 85), r(50, 88), await uniquePin());
    ids.push(row.id);
  }
  return ids;
};
