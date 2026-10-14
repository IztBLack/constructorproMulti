import 'package:constructorpro/domain/unicos.dart';
import 'package:flutter_test/flutter_test.dart';

typedef C = ({String id, String clave, String desc, String estado, int upd});

void main() {
  int pref(C c) => (c.estado == 'synced' ? 1 << 40 : 0) + c.upd;
  String llave(C c) => llaveConcepto(c.clave, c.desc);

  test('la misma clave repetida queda una vez, en su lugar', () {
    final l = <C>[
      (id: '1', clave: 'APLA.EXT', desc: 'Aplanado', estado: 'skipped', upd: 1),
      (id: '2', clave: 'APLA.INT', desc: 'Interior', estado: 'synced', upd: 1),
      (id: '3', clave: 'apla.ext ', desc: 'Aplanado', estado: 'synced', upd: 5),
      (id: '4', clave: 'APLA.EXT', desc: 'Aplanado', estado: 'synced', upd: 9),
    ];
    final u = unicos(l, llave: llave, preferencia: pref);
    expect(u.map((c) => c.id), ['4', '2']);
  });

  test('gana la copia que ya está en la nube aunque la local sea más nueva', () {
    final l = <C>[
      (id: 'local', clave: 'X', desc: 'x', estado: 'skipped', upd: 99),
      (id: 'nube', clave: 'X', desc: 'x', estado: 'synced', upd: 1),
    ];
    expect(unicos(l, llave: llave, preferencia: pref).single.id, 'nube');
  });

  test('sin clave se distingue por descripción', () {
    final l = <C>[
      (id: 'a', clave: '', desc: 'Limpieza final', estado: 'synced', upd: 1),
      (id: 'b', clave: '', desc: 'limpieza final ', estado: 'synced', upd: 2),
      (id: 'c', clave: '', desc: 'Otra cosa', estado: 'synced', upd: 1),
    ];
    expect(unicos(l, llave: llave, preferencia: pref).map((c) => c.id), ['b', 'c']);
  });
}
